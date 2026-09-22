use chrono::{Duration, NaiveDate};
use percent_encoding::percent_decode_str;
use regex::Regex;
use reqwest::blocking::Client;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, fs, path::PathBuf, time::Duration as StdDuration};

#[derive(Clone)]
pub struct Auth { pub cookie: String, pub jwt: String, pub user: String, pub tenant: String }

pub fn parse_cookies(cookies:&[tauri::webview::cookie::Cookie<'static>])->Option<Auth>{
    let mut values=std::collections::HashMap::new();
    for c in cookies {values.insert(c.name().to_string(),c.value().to_string());}
    let user_raw=percent_decode_str(values.get("JWTUser")?).decode_utf8().ok()?;
    let user:Value=serde_json::from_str(&user_raw).ok()?;
    let jwt_raw=percent_decode_str(values.get("_token")?).decode_utf8().ok()?;
    let jwt=Regex::new(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+").ok()?.find(&jwt_raw)?.as_str().to_string();
    let user=user["id"].as_str().map(str::to_owned).or_else(||user["id"].as_i64().map(|n|n.to_string()))?;
    let tenant=user_value(&serde_json::from_str::<Value>(&user_raw).ok()?,"tenant_id")?;
    let cookie=values.iter().map(|(k,v)|format!("{k}={v}")).collect::<Vec<_>>().join("; ");
    Some(Auth{cookie,jwt,user,tenant})
}
fn user_value(v:&Value,key:&str)->Option<String>{v[key].as_str().map(str::to_owned).or_else(||v[key].as_i64().map(|n|n.to_string()))}

pub fn identity(prefix:&str,parts:&[&str])->String{
    let raw=serde_json::to_string(parts).unwrap_or_default();
    let hash=Sha256::digest(raw.as_bytes());
    format!("{prefix}:{}",hash.iter().map(|b|format!("{b:02x}")).collect::<String>())
}

pub fn client(auth:&Auth,timeout:u64)->Result<Client,String>{
    let mut headers=reqwest::header::HeaderMap::new();
    for (key,value) in [
        ("User-Agent","Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36".to_string()),
        ("Referer","https://video.jw.scut.edu.cn/".to_string()),
        ("Origin","https://video.jw.scut.edu.cn".to_string()),
        ("X-Requested-With","XMLHttpRequest".to_string()),
        ("Authorization",format!("Bearer {}",auth.jwt)),
        ("Cookie",auth.cookie.clone())]
    {headers.insert(reqwest::header::HeaderName::from_bytes(key.as_bytes()).map_err(|e|e.to_string())?,value.parse().map_err(|e:reqwest::header::InvalidHeaderValue|e.to_string())?);}
    Client::builder().no_proxy().timeout(StdDuration::from_secs(timeout.clamp(5,600))).default_headers(headers).build().map_err(|e|e.to_string())
}

fn get_json(client:&Client,url:&str,params:&[(&str,&str)])->Result<Value,String>{
    let response=client.get(url).query(params).send().map_err(|_|"平台连接失败，请检查网络或重新登录。".to_string())?;
    if !response.status().is_success(){return Err(format!("平台请求失败（HTTP {}）。请检查登录状态和网络。",response.status()));}
    if !response.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v|v.to_str().ok()).unwrap_or("").contains("json") {return Err("平台返回了网页而不是数据，请重新登录。".into());}
    response.json().map_err(|e|e.to_string())
}

pub fn scan(auth:&Auth,start:&str,end:&str,timeout:u64)->Result<Vec<Value>,String>{
    let mut day=NaiveDate::parse_from_str(start,"%Y-%m-%d").map_err(|_|"开始日期无效。")?;
    let final_day=NaiveDate::parse_from_str(end,"%Y-%m-%d").map_err(|_|"结束日期无效。")?;
    if final_day<day{return Err("开始日期不能晚于结束日期。".into());}
    if (final_day-day).num_days()>120{return Err("一次最多扫描 120 天课程。".into());}
    let client=client(auth,timeout)?;
    let mut out=Vec::new();let mut seen=HashSet::new();
    while day<=final_day{
        let last=(day+Duration::days(6)).min(final_day);
        let a=day.format("%Y-%m-%d").to_string();let b=last.format("%Y-%m-%d").to_string();
        let result=get_json(&client,"https://video.jw.scut.edu.cn/courseapi/v2/schedule/get-week-schedules",&[
            ("user_id",&auth.user),("tenant_id",&auth.tenant),("start_at",&a),("end_at",&b),("token",&auth.jwt)])?;
        let blocks=result["result"]["list"].as_array().ok_or("课表数据不完整，请重新登录。")?;
        for block in blocks {let date=block["day"].as_str().unwrap_or("");for c in block["course"].as_array().into_iter().flatten(){
            let sub=user_value(c,"id").unwrap_or_default();if sub.is_empty()||!seen.insert(sub.clone()){continue;}
            let course_id=user_value(c,"course_id").unwrap_or_default();
            let title=c["course_title"].as_str().unwrap_or("未命名课程");
            let cid=identity("scut",&[&auth.tenant,&auth.user,&course_id,&sub]);
            let gid=identity("course",&[&auth.tenant,&auth.user,&course_id]);
            out.push(json!({"id":cid,"groupId":gid,"title":title,"course_id":course_id,"sub_id":sub,"day":date,"topic":"课堂课件"}));
        }}
        day=last+Duration::days(1);
    }
    out.sort_by(|a,b|a["day"].as_str().unwrap_or("").cmp(b["day"].as_str().unwrap_or("")));
    Ok(out)
}

pub fn image_urls(client:&Client,course:&Value)->Result<Vec<String>,String>{
    let result=get_json(client,"https://video.jw.scut.edu.cn/pptnote/v1/schedule/search-ppt",&[
        ("course_id",course["course_id"].as_str().unwrap_or("")),("sub_id",course["sub_id"].as_str().unwrap_or("")),("page","1"),("per_page","1000")])?;
    let items=result["list"].as_array().ok_or("没有收到有效课件列表。")?;
    let mut urls=Vec::new();let mut seen=HashSet::new();
    for item in items {let Some(raw)=item["content"].as_str() else{continue};let Ok(obj)=serde_json::from_str::<Value>(raw) else{continue};
        let Some(url)=obj["pptimgurl"].as_str().or_else(||obj["pptthumb"].as_str()) else{continue};
        if url.starts_with("https://")&&seen.insert(url.to_string()){urls.push(url.to_string());}
    }
    if urls.is_empty(){return Err("这节课没有可用的课件页面。".into());}
    Ok(urls)
}

pub fn download_images(client:&Client,urls:&[String],directory:&PathBuf,mut checkpoint:impl FnMut(usize,usize)->Result<(),String>)->Result<Vec<PathBuf>,String>{
    fs::create_dir_all(directory).map_err(|e|e.to_string())?;
    let mut paths=Vec::new();
    for (i,url) in urls.iter().enumerate(){
        checkpoint(i,urls.len())?;
        let target=directory.join(format!("{:05}.jpg",i+1));
        let mut succeeded=false;
        for _ in 0..3 {
            let response=client.get(url).send();
            if let Ok(response)=response {if response.status().is_success(){if let Ok(bytes)=response.bytes(){if image::load_from_memory(&bytes).is_ok(){
                fs::write(&target,&bytes).map_err(|e|e.to_string())?;succeeded=true;break;
            }}}}
        }
        if !succeeded{return Err(format!("第 {} 页下载失败；已下载的临时文件将清理。",i+1));}
        paths.push(target);
        checkpoint(i+1,urls.len())?;
    }
    Ok(paths)
}
