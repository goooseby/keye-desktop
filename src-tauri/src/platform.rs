use chrono::{Duration, NaiveDate};
use percent_encoding::percent_decode_str;
use regex::Regex;
use reqwest::blocking::Client;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, fs, io::Write, path::{Path,PathBuf}, sync::Mutex, time::{Duration as StdDuration,Instant}};

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

// Only structured diagnostics: never serialize Auth, response bodies or complete URLs.
static DOWNLOAD_LOG_LOCK:Mutex<()>=Mutex::new(());
struct DownloadLog { path:PathBuf, task:String }
impl DownloadLog {
    fn record(&self,event:&str,mut details:Value){
        // Release builds keep only failures; full request tracing belongs to development.
        if !cfg!(debug_assertions)&&!matches!(event,"page_skipped"|"download_failed")&&!(event=="page_result"&&details["ok"]==false){return;}
        details["event"]=json!(event);details["at"]=json!(chrono::Utc::now().to_rfc3339());details["task"]=json!(self.task);
        let write=(||->std::io::Result<()>{
            let _guard=DOWNLOAD_LOG_LOCK.lock().map_err(|_|std::io::Error::other("diagnostic lock unavailable"))?;
            if let Some(parent)=self.path.parent(){fs::create_dir_all(parent)?;}
            if fs::metadata(&self.path).is_ok_and(|m|m.len()>4*1024*1024){
                let backup=self.path.with_extension("previous.jsonl");
                match fs::remove_file(&backup){Ok(())=>{},Err(e) if e.kind()==std::io::ErrorKind::NotFound=>{},Err(e)=>return Err(e)}
                fs::rename(&self.path,backup)?;
            }
            let mut file=fs::OpenOptions::new().create(true).append(true).open(&self.path)?;
            writeln!(file,"{details}")
        })();
        if let Err(error)=write{eprintln!("Download diagnostics unavailable ({:?})",error.kind());}
    }
}
fn transport_failure(error:&reqwest::Error)->&'static str{
    if error.is_timeout(){"timeout"}else if error.is_connect(){"connection"}else if error.is_body(){"body_transfer"}else{"request"}
}
fn fetch_image(client:&Client,url:&str,target:&Path,details:&mut Value)->Result<(),String>{
    let response=client.get(url).send().map_err(|e|{
        details["stage"]=json!("request");details["category"]=json!(transport_failure(&e));
        if e.is_timeout(){"请求超时".to_string()}else{"网络请求失败".to_string()}
    })?;
    details["http"]=json!(response.status().as_u16());
    details["contentType"]=json!(response.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v|v.to_str().ok()).unwrap_or("").chars().take(120).collect::<String>());
    details["contentLength"]=json!(response.content_length());
    details["redirected"]=json!(response.url().as_str()!=url);
    details["responseHost"]=json!(response.url().host_str());
    if !response.status().is_success(){details["stage"]=json!("http");return Err(format!("HTTP {}",response.status().as_u16()));}
    let bytes=response.bytes().map_err(|e|{details["stage"]=json!("body");details["category"]=json!(transport_failure(&e));"响应内容接收失败".to_string()})?;
    details["bytes"]=json!(bytes.len());
    if bytes.is_empty(){details["stage"]=json!("empty_body");return Err("服务器返回空图片（0 字节）".into());}
    details["imageFormat"]=json!(image::guess_format(&bytes).ok().map(|format|format!("{format:?}")));
    let decoded=image::load_from_memory(&bytes).map_err(|_|{details["stage"]=json!("image_decode");"响应内容不是可读取的图片".to_string()})?;
    details["width"]=json!(decoded.width());details["height"]=json!(decoded.height());
    fs::write(target,&bytes).map_err(|e|{details["stage"]=json!("file_write");details["ioKind"]=json!(format!("{:?}",e.kind()));"图片写入本地失败".to_string()})?;
    details["stage"]=json!("complete");
    Ok(())
}

#[derive(Debug)]
pub struct DownloadedPages {
    pub paths:Vec<PathBuf>,
    pub source_pages:Vec<usize>,
    pub missing:Vec<Value>,
    pub total:usize,
}
pub fn download_images(client:&Client,urls:&[String],directory:&PathBuf,log_path:&Path,mut checkpoint:impl FnMut(usize,usize)->Result<(),String>)->Result<DownloadedPages,String>{
    fs::create_dir_all(directory).map_err(|e|e.to_string())?;
    let log=DownloadLog{path:log_path.to_path_buf(),task:directory.file_name().unwrap_or_default().to_string_lossy().into_owned()};
    log.record("download_start",json!({"pages":urls.len(),"attemptsPerPage":3}));
    let mut batch=DownloadedPages{paths:Vec::new(),source_pages:Vec::new(),missing:Vec::new(),total:urls.len()};
    for (i,url) in urls.iter().enumerate(){
        checkpoint(i,urls.len())?;
        let target=directory.join(format!("{:05}.jpg",i+1));
        let mut succeeded=false;let mut last_error=String::new();
        for attempt in 1..=3 {
            checkpoint(i,urls.len())?;
            let mut details=json!({"page":i+1,"total":urls.len(),"attempt":attempt,
                "host":reqwest::Url::parse(url).ok().and_then(|u|u.host_str().map(str::to_owned)),
                "resource":identity("image",&[url])});
            log.record("page_attempt",details.clone());
            let started=Instant::now();
            let result=fetch_image(client,url,&target,&mut details);
            details["elapsedMs"]=json!(started.elapsed().as_millis() as u64);
            details["ok"]=json!(result.is_ok());log.record("page_result",details.clone());
            match result {Ok(())=>{succeeded=true;break;},Err(error)=>{last_error=error;if details["stage"]=="file_write"{return Err(format!("第 {} 页写入本地失败，请检查空间和目录权限。",i+1));}}}
        }
        if succeeded{batch.paths.push(target);batch.source_pages.push(i+1);}
        else{log.record("page_skipped",json!({"page":i+1,"reason":last_error}));batch.missing.push(json!({"page":i+1,"reason":last_error}));}
        checkpoint(i+1,urls.len())?;
    }
    if batch.paths.is_empty(){
        let reason=batch.missing.first().and_then(|v|v["reason"].as_str()).unwrap_or("平台未提供可用页面");
        log.record("download_failed",json!({"reason":reason}));return Err(format!("没有下载到可用页面（{reason}），请检查平台或登录状态。"));
    }
    log.record("download_complete",json!({"pages":batch.paths.len(),"total":batch.total,"missing":batch.missing}));Ok(batch)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{io::Read,net::{TcpListener,TcpStream},thread};
    fn read_request(stream:&mut TcpStream)->Option<String>{
        // Accepted sockets may inherit nonblocking mode on Windows.
        stream.set_nonblocking(false).ok()?;stream.set_read_timeout(Some(StdDuration::from_secs(2))).ok()?;
        let mut request=Vec::new();let mut buffer=[0;4096];
        while request.len()<16384&&!request.ends_with(b"\r\n\r\n"){
            let n=stream.read(&mut buffer).ok()?;if n==0{return None;}request.extend_from_slice(&buffer[..n]);
        }
        Some(String::from_utf8_lossy(&request).into_owned())
    }

    fn exercise(status:u16,content_type:&str,body:Vec<u8>,attempts:usize)->(Result<DownloadedPages,String>,String){
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let url=format!("http://{}/private-page?token=do-not-log-this",listener.local_addr().unwrap());
        let content_type=content_type.to_owned();
        let server=thread::spawn(move||{
            let deadline=Instant::now()+StdDuration::from_secs(10);let mut served=0;
            while served<attempts&&Instant::now()<deadline{
                let (mut stream,_)=match listener.accept(){Ok(pair)=>pair,Err(e) if e.kind()==std::io::ErrorKind::WouldBlock=>{thread::sleep(StdDuration::from_millis(5));continue;},Err(e)=>panic!("{e}")};
                if read_request(&mut stream).is_none(){continue;}
                write!(stream,"HTTP/1.1 {status} Test\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len()).unwrap();
                stream.write_all(&body).unwrap();served+=1;
            }
            served
        });
        let root=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.build/test-data").join(uuid::Uuid::new_v4().simple().to_string());
        let log=root.join("logs/downloads.jsonl");
        let client=Client::builder().no_proxy().timeout(StdDuration::from_secs(3)).build().unwrap();
        let result=download_images(&client,&[url],&root.join("task"),&log,|_,_|Ok(()));
        assert_eq!(server.join().unwrap(),attempts);
        let contents=fs::read_to_string(log).unwrap();
        assert!(!contents.contains("do-not-log-this"));assert!(!contents.contains("private-page"));
        fs::remove_dir_all(root).unwrap();(result,contents)
    }
    #[test]
    fn download_diagnostics_distinguish_http_errors_without_logging_credentials(){
        let (result,log)=exercise(403,"text/html",b"private-response-must-not-be-logged".to_vec(),3);
        assert!(result.unwrap_err().contains("HTTP 403"));
        assert!(log.contains("\"stage\":\"http\""));assert!(log.contains("\"attempt\":3"));
        assert!(!log.contains("private-response-must-not-be-logged"));
    }
    #[test]
    fn download_diagnostics_distinguish_invalid_images(){
        let (result,log)=exercise(200,"text/html",b"<html>private-response-must-not-be-logged</html>".to_vec(),3);
        assert!(result.unwrap_err().contains("响应内容不是可读取的图片"));
        assert!(log.contains("\"stage\":\"image_decode\""));assert!(log.contains("text/html"));
        assert!(!log.contains("private-response-must-not-be-logged"));
    }
    #[test]
    fn download_diagnostics_record_successful_image_dimensions(){
        let mut body=std::io::Cursor::new(Vec::new());
        image::RgbImage::new(16,12).write_to(&mut body,image::ImageFormat::Png).unwrap();
        let (result,log)=exercise(200,"image/png",body.into_inner(),1);
        assert_eq!(result.ok().unwrap().paths.len(),1);assert!(log.contains("\"width\":16"));assert!(log.contains("download_complete"));
    }
    #[test]
    fn empty_page_thirty_does_not_discard_the_other_thirty_nine_pages(){
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();listener.set_nonblocking(true).unwrap();
        let address=listener.local_addr().unwrap();
        let mut jpeg=std::io::Cursor::new(Vec::new());image::RgbImage::new(48,32).write_to(&mut jpeg,image::ImageFormat::Jpeg).unwrap();
        let server=thread::spawn(move||{
            let deadline=Instant::now()+StdDuration::from_secs(10);let mut count=0;
            while count<42&&Instant::now()<deadline{
                let (mut stream,_)=match listener.accept(){Ok(pair)=>pair,Err(e) if e.kind()==std::io::ErrorKind::WouldBlock=>{thread::sleep(StdDuration::from_millis(5));continue;},Err(e)=>panic!("{e}")};
                let Some(request)=read_request(&mut stream)else{continue;};
                let empty=request.starts_with("GET /30?");
                let body=if empty{&[][..]}else{jpeg.get_ref().as_slice()};
                write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: image/jpeg\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len()).unwrap();stream.write_all(body).unwrap();count+=1;
            }
            count
        });
        let root=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.build/test-data").join(uuid::Uuid::new_v4().simple().to_string());
        let urls=(1..=40).map(|p|format!("http://{address}/{p}?token=do-not-log-this")).collect::<Vec<_>>();
        let client=Client::builder().no_proxy().timeout(StdDuration::from_secs(3)).build().unwrap();
        let started=Instant::now();
        let batch=download_images(&client,&urls,&root.join("task"),&root.join("downloads.jsonl"),|_,_|{
            if started.elapsed()>StdDuration::from_secs(8){Err("mock server timed out".into())}else{Ok(())}
        }).unwrap();
        assert_eq!(server.join().unwrap(),42);assert_eq!(batch.paths.len(),39);assert_eq!(batch.total,40);
        assert_eq!(batch.source_pages[29],31);assert_eq!(batch.source_pages.last(),Some(&40));
        assert_eq!(batch.missing.len(),1);assert_eq!(batch.missing[0]["page"],30);assert!(batch.missing[0]["reason"].as_str().unwrap().contains("0 字节"));
        assert!(batch.paths.iter().all(|p|p.is_file()));
        let log=fs::read_to_string(root.join("downloads.jsonl")).unwrap();assert!(!log.contains("do-not-log-this"));assert!(log.contains("empty_body"));
        fs::remove_dir_all(root).unwrap();
    }
}
