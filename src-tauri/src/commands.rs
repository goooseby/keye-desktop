use crate::library::{is_image, Library};
use serde_json::{json, Value};
use std::{collections::{HashMap,HashSet},fs, path::{Path, PathBuf}, sync::{Arc,Condvar,Mutex,RwLock,atomic::{AtomicBool,Ordering}}};
use tauri::{AppHandle, Emitter, Manager};
use tauri::menu::{Menu,MenuItem,Submenu};

const LOGIN_TOOLBAR_SCRIPT: &str = r#"
(() => {
  if (window.top !== window) return;
  const mount = () => {
    if (!document.body || document.getElementById('keye-login-toolbar')) return;
    const bar = document.createElement('div');
    bar.id = 'keye-login-toolbar';
    bar.style.cssText = 'position:fixed;top:12px;right:16px;z-index:2147483647;display:flex;align-items:center;gap:6px;padding:7px 9px;border:1px solid #c8dbd1;border-radius:10px;background:#fafffc;box-shadow:0 5px 20px #173a3040;color:#244c3a;font:12px Microsoft YaHei,Segoe UI,sans-serif;';
    const note = document.createElement('span');
    note.textContent = '课页 · 登录后自动返回';
    note.style.cssText = 'font-weight:600;margin:0 6px;white-space:nowrap;';
    bar.append(note);
    for (const [label, action] of [['平台首页', 'home'], ['刷新网页', 'reload'], ['立即检测', 'check']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.style.cssText = 'font:inherit;color:#175f49;border:1px solid #c8dbd1;border-radius:6px;background:#fff;padding:5px 8px;cursor:pointer;white-space:nowrap;';
      button.addEventListener('click', event => {
        event.stopPropagation();
        if (action === 'check') note.textContent = '正在检测登录状态…';
        window.location.assign('keye-login://' + action);
      });
      bar.append(button);
    }
    document.body.append(bar);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
"#;

pub struct TaskControl { paused: AtomicBool, cancelled: AtomicBool, started: AtomicBool }
impl TaskControl {fn new()->Self{Self{paused:AtomicBool::new(false),cancelled:AtomicBool::new(false),started:AtomicBool::new(false)}}}
#[derive(Default)]
pub struct Runtime { pub auth: Option<crate::platform::Auth>, pub courses: Vec<Value>, pub scanned: bool, pub scanning: bool, pub scan_error: String, pub login_status: String, pub login_window: Option<String>, pub controls: HashMap<String,Arc<TaskControl>> }
pub struct AppState { pub library: Arc<RwLock<Arc<Library>>>, pub base: PathBuf, pub runtime: Arc<Mutex<Runtime>>, pub import_busy: Arc<AtomicBool>, pub download_gate: Arc<(Mutex<usize>,Condvar)>, pub download_enqueue: Mutex<()>, pub export_lock: Mutex<()> }
fn text<'a>(v: &'a Value, key: &str) -> &'a str { v[key].as_str().unwrap_or("") }
fn required<'a>(v: &'a Value,key:&str)->Result<&'a str,String>{v[key].as_str().filter(|s|!s.is_empty()).ok_or_else(||format!("缺少 {key}。"))}
fn snapshot(app:&AppHandle,library:&Library)->Result<Value,String>{
    let mut value=library.snapshot()?;
    let state=app.state::<AppState>();
    let runtime=state.runtime.lock().map_err(|_|"运行状态无法读取。".to_string())?;
    value["loggedIn"]=json!(runtime.auth.is_some());value["courses"]=json!(runtime.courses);
    value["scanned"]=json!(runtime.scanned);value["scanning"]=json!(runtime.scanning);value["scanError"]=json!(runtime.scan_error);
    value["loginStatus"]=json!(runtime.login_status);
    value["loginWindowOpen"]=json!(runtime.login_window.as_ref().is_some_and(|label|app.get_webview_window(label).is_some()));
    Ok(value)
}
fn sync(app: &AppHandle, library: &Library) -> Result<(), String> { app.emit("snapshot-changed",snapshot(app,library)?).map_err(|e|e.to_string()) }
fn safe_name(name:&str)->String {let s:String=name.chars().map(|c|if "\\/:*?\"<>|".contains(c)||c.is_control(){'_'}else{c}).collect();let s=s.trim().trim_end_matches('.');if s.is_empty(){"课件".into()}else{s.chars().take(120).collect()}}
fn timestamp()->u128{std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()}

#[tauri::command]
pub async fn request(app: AppHandle, state: tauri::State<'_, AppState>, command: String, data: Value) -> Result<Value,String> {
    let library = state.library.read().map_err(|_|"资料库状态无法读取。")?.clone();
    tauri::async_runtime::spawn_blocking(move || {
        dispatch(&app,&library,&command,&data)
    }).await.map_err(|e|e.to_string())?
}

fn dispatch(app:&AppHandle, lib:&Library, command:&str, data:&Value)->Result<Value,String>{
    match command {
        "snapshot" => snapshot(app,lib),
        "login" => login(app,lib),
        "loginControl" => login_control(app,data),
        "logout" => {let state=app.state::<AppState>();let mut runtime=state.runtime.lock().map_err(|_|"运行状态无法读取。")?;runtime.auth=None;runtime.courses.clear();runtime.scanned=false;runtime.login_status.clear();drop(runtime);sync(app,lib)?;Ok(json!(true))}
        "scan" => scan(app,lib,data),
        "download" => download(app,lib,data),
        "saveCourse" => {let c=lib.save_course(data)?;sync(app,lib)?;Ok(c)}
        "courseCover" => {let c=lib.courses()?.into_iter().find(|c|c["id"]==data["id"]).ok_or("课程不存在。")?;
            let result=lib.save_course(&json!({"id":c["id"],"title":c["title"],"term":c["term"],"coverStyle":data["style"],"coverPalette":data["palette"]}))?;sync(app,lib)?;Ok(result)}
        "assignCourse" => {let cid=data["courseId"].as_str().filter(|s|!s.is_empty());
            if let Some(cid)=cid {if !lib.courses()?.iter().any(|c|c["id"]==cid){return Err("课程不存在。".into());}}
            for mid in data["ids"].as_array().ok_or("课件列表无效。")? {lib.update_material(mid.as_str().ok_or("课件编号无效。")?,&json!({"courseId":cid}))?;}sync(app,lib)?;Ok(json!(true))}
        "reviewed" => {let mid=required(data,"id")?;let m=lib.get_material(mid)?;if m["revision"]!=data["revision"]||m["deleted"]==true{return Err("课件已更新，请重新确认整理状态。".into());}
            lib.update_material(mid,&json!({"reviewRevision":data["revision"],"touched":timestamp()}))?;sync(app,lib)?;Ok(json!(true))}
        "reviewQueue" => {let ids=data["ids"].as_array().ok_or("整理列表无效。")?;for id in ids {if lib.get_material(id.as_str().ok_or("编号无效。")?)?["deleted"]==true{return Err("请先恢复课件。".into());}}
            lib.set_setting("reviewQueue",&data["ids"])?;sync(app,lib)?;Ok(json!(true))}
        "materialNote" => {lib.update_material(required(data,"id")?,&json!({"note":text(data,"note").trim().chars().take(120).collect::<String>()}))?;sync(app,lib)?;Ok(json!(true))}
        "selection" => {lib.selection(required(data,"id")?,&data["excluded"],&data["revision"])?;sync(app,lib)?;Ok(json!(true))}
        "openMaterial" => {let mid=required(data,"id")?;if lib.get_material(mid)?["deleted"]==true{return Err("请先恢复课件。".into());}lib.set_setting("lastMaterial",&json!(mid))?;Ok(json!(true))}
        "lastPage" => {let mid=required(data,"id")?;let m=lib.get_material(mid)?;let page=data["page"].as_u64().unwrap_or(1).clamp(1,m["pages"].as_u64().unwrap_or(1));lib.update_material(mid,&json!({"lastPage":page}))?;Ok(json!(true))}
        "trash" => {lib.update_material(required(data,"id")?,&json!({"deleted":data["deleted"]==true,"touched":timestamp()}))?;sync(app,lib)?;Ok(json!(true))}
        "settings" => {let mut settings=lib.setting("settings",json!({"exportMode":"review","exportDir":"","maxWorkers":2,"timeout":30,"retries":3,"sleepMs":100}))?;
            for (key,lo,hi) in [("maxWorkers",1,4),("timeout",5,600),("retries",1,10),("sleepMs",0,5000)] {if !data[key].is_null(){let n=data[key].as_i64().ok_or("设置值无效。")?;if n<lo||n>hi{return Err(format!("{key} 超出范围。"));}settings[key]=json!(n);}}
            if !data["exportMode"].is_null(){let mode=text(data,"exportMode");if mode!="review"&&mode!="direct"{return Err("获取方式无效。".into());}settings["exportMode"]=json!(mode);}
            lib.set_setting("settings",&settings)?;sync(app,lib)?;Ok(json!(true))}
        "import" => import(app,lib,data),
        "quickExport" => export(app,lib,data,true),
        "export" => export(app,lib,data,false),
        "batchExport" => batch_export(app,lib,data),
        "chooseExportDir" => {let path=rfd::FileDialog::new().set_title("选择默认 PDF 导出目录").pick_folder();if let Some(path)=path {let mut s=lib.setting("settings",json!({}))?;s["exportDir"]=json!(path.display().to_string());lib.set_setting("settings",&s)?;sync(app,lib)?;Ok(json!(true))}else{Ok(json!(false))}}
        "openLibrary" => {open_dir(&lib.root)?;Ok(json!(true))}
        "chooseLibrary" => choose_library(app),
        "openExport" => {let m=lib.get_material(required(data,"id")?)?;let path=PathBuf::from(text(&m,"exportPath"));if !path.is_file(){return Err("导出文件不存在。".into());}open_dir(path.parent().ok_or("导出路径无效。")?)?;Ok(json!(true))}
        "task" => task_action(app,lib,data),
        "openRelease" => {std::process::Command::new("explorer").arg("https://github.com/goooseby/keye-desktop/releases").spawn().map_err(|e|e.to_string())?;Ok(json!(true))}
        _ => Err(format!("此功能尚未接入：{command}")),
    }
}

fn open_dir(path:&Path)->Result<(),String>{std::process::Command::new("explorer").arg(path).spawn().map_err(|e|e.to_string())?;Ok(())}
fn choose_library(app:&AppHandle)->Result<Value,String>{
    let state=app.state::<AppState>();
    {let runtime=state.runtime.lock().map_err(|_|"运行状态无法读取。")?;if runtime.scanning||!runtime.controls.is_empty()||state.import_busy.load(Ordering::SeqCst){return Err("请等待后台任务完成后再切换资料库。".into());}}
    let current=state.library.read().map_err(|_|"资料库状态无法读取。")?.root.clone();
    let Some(path)=rfd::FileDialog::new().set_title("选择资料库目录").set_directory(current).pick_folder() else{return Ok(json!(false))};
    let next=Arc::new(Library::open(path)?);
    let settings=json!({"libraryDir":next.root.display().to_string()});
    let temporary=state.base.join("app-settings.json.part");
    fs::write(&temporary,settings.to_string()).map_err(|e|e.to_string())?;
    fs::rename(&temporary,state.base.join("app-settings.json")).map_err(|e|e.to_string())?;
    {let mut active=state.library.write().map_err(|_|"资料库状态无法写入。")?;*active=next.clone();}
    sync(app,&next)?;Ok(json!(true))
}

fn login(app:&AppHandle,lib:&Library)->Result<Value,String>{
    let state=app.state::<AppState>();
    let previous={let mut runtime=state.runtime.lock().map_err(|_|"运行状态无法读取。")?;
        runtime.login_status="正在打开学校登录窗口…".into();runtime.login_window.take()};
    sync(app,lib)?;
    if let Some(label)=previous {if let Some(window)=app.get_webview_window(&label){let _=window.close();}}
    let label=format!("login-{}",uuid::Uuid::new_v4().simple());
    let profile=state.base.join("login-webview");
    let (sender,receiver)=std::sync::mpsc::channel();
    let app_handle=app.clone();let window_label=label.clone();
    app.run_on_main_thread(move||{
        let result=(||{
            let url=tauri::Url::parse("https://video.jw.scut.edu.cn/").map_err(|e|e.to_string())?;
            let home=MenuItem::with_id(&app_handle,"login-home","返回平台首页",true,None::<&str>).map_err(|e|e.to_string())?;
            let reload=MenuItem::with_id(&app_handle,"login-reload","重新加载网页",true,Some("Ctrl+R")).map_err(|e|e.to_string())?;
            let check=MenuItem::with_id(&app_handle,"login-check","立即检测登录状态",true,None::<&str>).map_err(|e|e.to_string())?;
            let tools=Submenu::with_items(&app_handle,"登录工具",true,&[&home,&reload,&check]).map_err(|e|e.to_string())?;
            let menu=Menu::with_items(&app_handle,&[&tools]).map_err(|e|e.to_string())?;
            let menu_app=app_handle.clone();let menu_label=window_label.clone();
            let nav_app=app_handle.clone();let nav_label=window_label.clone();
            tauri::WebviewWindowBuilder::new(&app_handle,&window_label,tauri::WebviewUrl::External(url))
                .title("登录华工视频平台 · 登录成功后自动关闭")
                .inner_size(1100.0,760.0).incognito(true).data_directory(profile)
                .initialization_script(LOGIN_TOOLBAR_SCRIPT)
                .on_page_load(|window,payload|{
                    if matches!(payload.event(),tauri::webview::PageLoadEvent::Finished){let _=window.eval(LOGIN_TOOLBAR_SCRIPT);}
                })
                .menu(menu)
                .on_navigation(move|url|{
                    if url.scheme()!="keye-login"{return true;}
                    let action=url.host_str().unwrap_or("").to_string();
                    let app=nav_app.clone();let label=nav_label.clone();
                    std::thread::spawn(move||{
                        let Some(window)=app.get_webview_window(&label) else{return};
                        match action.as_str(){
                            "home"=>{if let Ok(url)=tauri::Url::parse("https://video.jw.scut.edu.cn/"){let _=window.navigate(url);}},
                            "reload"=>{let _=window.reload();},
                            "check"=>{let _=check_login_cookies(&app,&label,true);},
                            _=>{}
                        }
                    });
                    false
                })
                .on_menu_event(move|_,event|{
                    let Some(window)=menu_app.get_webview_window(&menu_label) else{return};
                    if event.id()==home.id(){if let Ok(url)=tauri::Url::parse("https://video.jw.scut.edu.cn/"){let _=window.navigate(url);}}
                    else if event.id()==reload.id(){let _=window.reload();}
                    else if event.id()==check.id(){let app=menu_app.clone();let label=menu_label.clone();std::thread::spawn(move||{
                        if let Err(error)=check_login_cookies(&app,&label,true){
                            let state=app.state::<AppState>();
                            if let Ok(mut runtime)=state.runtime.lock(){runtime.login_status=error.clone();}
                            if let Some(window)=app.get_webview_window(&label){let _=window.set_title(&error);}
                            if let Ok(library)=state.library.read(){let _=sync(&app,&library);};
                        }
                    });}
                })
                .build().map_err(|e|e.to_string())?;
            Ok::<(),String>(())
        })();
        let _=sender.send(result);
    }).map_err(|e|e.to_string())?;
    let opened=match receiver.recv_timeout(std::time::Duration::from_secs(15)){
        Ok(result)=>result,
        Err(_)=>{let error="登录窗口打开超时，请重试。".to_string();
            if let Ok(mut runtime)=state.runtime.lock(){runtime.login_status=error.clone();}
            let _=sync(app,lib);return Err(error);}
    };
    if let Err(error)=opened {
        if let Ok(mut runtime)=state.runtime.lock(){runtime.login_status=format!("登录窗口打开失败：{error}");}
        let _=sync(app,lib);return Err(error);
    }
    {let mut runtime=state.runtime.lock().map_err(|_|"运行状态无法读取。")?;
        runtime.login_window=Some(label.clone());runtime.login_status="登录窗口已打开；请在网页完成登录。若窗口空白或关闭，可再次点击连接平台重试。".into();}
    sync(app,lib)?;
    let app_handle=app.clone();
    std::thread::spawn(move||{
        for _ in 0..450 {
            std::thread::sleep(std::time::Duration::from_secs(2));
            if app_handle.get_webview_window(&label).is_none(){break;}
            if check_login_cookies(&app_handle,&label,false).unwrap_or(false){return;}
        }
        let state=app_handle.state::<AppState>();
        if let Ok(mut runtime)=state.runtime.lock(){if runtime.login_window.as_deref()==Some(&label){runtime.login_window=None;if runtime.auth.is_none(){runtime.login_status="登录窗口已关闭或等待超时；请点击连接平台重试。".into();}}}
        if let Ok(library)=state.library.read(){let _=sync(&app_handle,&library);};
    });
    Ok(json!(true))
}
fn scan(app:&AppHandle,lib:&Library,data:&Value)->Result<Value,String>{
    let start=required(data,"start")?;let end=required(data,"end")?;
    let state=app.state::<AppState>();
    let auth={let mut runtime=state.runtime.lock().map_err(|_|"运行状态无法读取。")?;
        let auth=runtime.auth.clone().ok_or("请先连接学校平台。")?;
        if runtime.scanning{return Err("正在扫描，请稍候。".into());}
        runtime.scanning=true;runtime.scanned=false;runtime.scan_error.clear();auth};
    sync(app,lib)?;
    let timeout=lib.setting("settings",json!({}))?["timeout"].as_u64().unwrap_or(30);
    let result=crate::platform::scan(&auth,start,end,timeout);
    {let mut runtime=state.runtime.lock().map_err(|_|"运行状态无法读取。")?;runtime.scanning=false;
        match &result {Ok(courses)=>{runtime.courses=courses.clone();runtime.scanned=true;},Err(error)=>{runtime.scan_error=error.clone();}}}
    sync(app,lib)?;
    result.map(|_|json!(true))
}

const MAX_COURSE_DOWNLOADS: usize = 4;

struct DownloadPermit(Arc<(Mutex<usize>,Condvar)>);
impl Drop for DownloadPermit {
    fn drop(&mut self) {
        let (count,ready)=&*self.0;
        if let Ok(mut active)=count.lock(){*active=active.saturating_sub(1);ready.notify_all();}
    }
}
fn login_control(app:&AppHandle,data:&Value)->Result<Value,String>{
    let state=app.state::<AppState>();
    let label=state.runtime.lock().map_err(|_|"运行状态无法读取。")?.login_window.clone().ok_or("登录窗口已关闭，请重新连接。")?;
    let window=app.get_webview_window(&label).ok_or("登录窗口已关闭，请重新连接。")?;
    match text(data,"action"){
        "home"=>{window.navigate(tauri::Url::parse("https://video.jw.scut.edu.cn/").map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;Ok(json!(true))},
        "reload"=>{window.reload().map_err(|e|e.to_string())?;Ok(json!(true))},
        "check"=>check_login_cookies(app,&label,true).map(|found|json!(found)),
        _=>Err("登录操作无效。".into())
    }
}
fn acquire_download_slot(gate:&Arc<(Mutex<usize>,Condvar)>,limit:usize,control:&TaskControl)->Result<DownloadPermit,String>{
    let (count,ready)=&**gate;
    let mut active=count.lock().map_err(|_|"下载队列无法使用。".to_string())?;
    loop {
        if control.cancelled.load(Ordering::SeqCst){return Err("已取消".into());}
        if !control.paused.load(Ordering::SeqCst)&&*active<limit {
            *active+=1;control.started.store(true,Ordering::SeqCst);
            return Ok(DownloadPermit(gate.clone()));
        }
        active=ready.wait_timeout(active,std::time::Duration::from_millis(150)).map_err(|_|"下载队列无法使用。".to_string())?.0;
    }
}
fn download(app:&AppHandle,lib:&Library,data:&Value)->Result<Value,String>{
    let state=app.state::<AppState>();
    let auth={state.runtime.lock().map_err(|_|"运行状态无法读取。")?.auth.clone().ok_or("请先连接学校平台。")?};
    let ids=data["ids"].as_array().ok_or("请选择课件。")?;
    if ids.is_empty(){return Err("请先选择课件。".into());}
    let direct=data["direct"]==true;
    if direct {
        let mut settings=lib.setting("settings",json!({}))?;
        if settings["exportDir"].as_str().unwrap_or("").is_empty(){
            let Some(path)=rfd::FileDialog::new().set_title("选择自动导出 PDF 的目录").pick_folder() else{return Ok(json!(false))};
            settings["exportDir"]=json!(path.display().to_string());lib.set_setting("settings",&settings)?;
        }
    }
    let settings=lib.setting("settings",json!({}))?;
    let timeout=settings["timeout"].as_u64().unwrap_or(30);
    let parallel=settings["maxWorkers"].as_u64().unwrap_or(2).clamp(1,MAX_COURSE_DOWNLOADS as u64) as usize;
    let library=state.library.read().map_err(|_|"资料库状态无法读取。")?.clone();
    let _enqueue=state.download_enqueue.lock().map_err(|_|"下载队列无法使用。")?;
    let existing:HashSet<String>=lib.materials()?.iter().filter_map(|m|m["sourceKey"].as_str().map(str::to_owned)).collect();
    let pending:HashSet<String>=lib.tasks()?.iter().filter(|t|matches!(t["status"].as_str(),Some("queued"|"running"|"paused")))
        .filter_map(|t|t["sourceKey"].as_str().map(str::to_owned)).collect();
    let courses={let runtime=state.runtime.lock().map_err(|_|"运行状态无法读取。")?;
        runtime.courses.iter().filter(|c|ids.contains(&c["id"])&&!existing.contains(text(c,"id"))&&!pending.contains(text(c,"id"))).cloned().collect::<Vec<_>>()};
    if courses.is_empty(){return Err("所选课件均已在资料库或下载队列中。".into());}
    let mut jobs=Vec::new();
    for course in courses {
        let id=uuid::Uuid::new_v4().simple().to_string();
        let title=format!("{} · {}",text(&course,"day"),text(&course,"title"));
        let task=json!({"id":id,"type":"download","title":title,"status":"queued","progress":0,"message":"排队等待下载","sourceKey":course["id"],"course":course,"direct":direct,"error":""});
        jobs.push((task,Arc::new(TaskControl::new())));
    }
    lib.put_tasks(&jobs.iter().map(|(task,_)|task.clone()).collect::<Vec<_>>())?;
    {let mut runtime=state.runtime.lock().map_err(|_|"运行状态无法读取。")?;
        for (task,control) in &jobs {runtime.controls.insert(text(task,"id").to_string(),control.clone());}}
    let _=sync(app,lib);
    for (task,control) in jobs {
        let app=app.clone();let library=library.clone();let auth=auth.clone();let gate=state.download_gate.clone();
        std::thread::spawn(move||run_download(app,library,auth,task,control,gate,parallel,timeout));
    }
    Ok(json!(true))
}
fn check_login_cookies(app:&AppHandle,label:&str,manual:bool)->Result<bool,String>{
    let window=app.get_webview_window(label).ok_or("登录窗口已关闭，请重新连接。")?;
    let url=tauri::Url::parse("https://video.jw.scut.edu.cn/").map_err(|e|e.to_string())?;
    let cookies=window.cookies_for_url(url).map_err(|e|format!("无法读取网页登录状态：{e}"))?;
    let state=app.state::<AppState>();
    if let Some(auth)=crate::platform::parse_cookies(&cookies){
        let newly_connected={let mut runtime=state.runtime.lock().map_err(|_|"运行状态无法读取。")?;
            if runtime.login_window.as_deref()!=Some(label){return Ok(false);}
            let fresh=runtime.auth.as_ref().is_none_or(|old|old.user!=auth.user||old.tenant!=auth.tenant||old.jwt!=auth.jwt);
            runtime.auth=Some(auth);runtime.login_window=None;runtime.login_status="已连接学校平台；登录窗口已自动关闭。".into();
            if fresh{runtime.scanned=false;runtime.courses.clear();}fresh};
        if let Ok(library)=state.library.read(){let _=sync(app,&library);}
        if newly_connected{let _=app.emit("notice","已连接学校平台，正在自动扫描课表。");}
        let _=window.close();
        return Ok(true);
    }
    if manual {
        if let Ok(mut runtime)=state.runtime.lock(){runtime.login_status="尚未检测到完整登录状态；请继续在网页操作。".into();}
        let _=window.set_title("尚未检测到完整登录状态 · 请继续登录");
        if let Ok(library)=state.library.read(){let _=sync(app,&library);}
    }
    Ok(false)
}
fn run_download(app:AppHandle,lib:Arc<Library>,auth:crate::platform::Auth,mut task:Value,control:Arc<TaskControl>,gate:Arc<(Mutex<usize>,Condvar)>,parallel:usize,timeout:u64){
    let id=text(&task,"id").to_string();
    let course=task["course"].clone();
    let result=(||{
        let _permit=acquire_download_slot(&gate,parallel,&control)?;
        task["status"]=json!("running");task["message"]=json!("正在读取课件页面");lib.put_task(&task)?;let _=app.emit("task-changed",task.clone());
        let client=crate::platform::client(&auth,timeout)?;
        let urls=crate::platform::image_urls(&client,&course)?;
        task["message"]=json!(format!("准备下载 {} 页",urls.len()));lib.put_task(&task)?;let _=app.emit("task-changed",task.clone());
        let temp=lib.root.join("temporary").join(&id);
        let result=(||{
            let paths=crate::platform::download_images(&client,&urls,&temp,|done,total|{
                while control.paused.load(Ordering::SeqCst)&&!control.cancelled.load(Ordering::SeqCst){std::thread::sleep(std::time::Duration::from_millis(150));}
                if control.cancelled.load(Ordering::SeqCst){return Err("已取消".into());}
                let percent=(done*85/total.max(1)) as u64;
                if task["progress"].as_u64()!=Some(percent){task["progress"]=json!(percent);task["message"]=json!(format!("已下载 {done} / {total} 页"));lib.put_task(&task)?;let _=app.emit("task-changed",task.clone());}
                Ok(())
            })?;
            if control.cancelled.load(Ordering::SeqCst){return Err("已取消".into());}
            task["progress"]=json!(85);task["message"]=json!("正在整理已下载页面");lib.put_task(&task)?;let _=app.emit("task-changed",task.clone());
            let gid=required(&course,"groupId")?;
            if !lib.courses()?.iter().any(|c|c["id"]==gid){lib.save_course(&json!({"id":gid,"title":course["title"]}))?;}
            let mut material=lib.import_images_with_progress(&paths,Some(gid),|done,total|{
                if control.cancelled.load(Ordering::SeqCst){return Err("已取消".into());}
                let percent=85+(done*14/total.max(1)) as u64;
                if task["progress"].as_u64()!=Some(percent){task["progress"]=json!(percent);task["message"]=json!(format!("正在整理 {done} / {total} 页"));lib.put_task(&task)?;let _=app.emit("task-changed",task.clone());}
                Ok(())
            })?;
            material["title"]=course["title"].clone();material["day"]=course["day"].clone();material["sourceKey"]=course["id"].clone();material["source"]=json!("platform");
            material["topic"]=json!("课堂课件");material["platformCourseId"]=course["course_id"].clone();material["lectureId"]=course["sub_id"].clone();
            lib.put_material(&material)?;
            Ok::<Value,String>(material)
        })();
        let _=fs::remove_dir_all(&temp);
        let material=result?;
        if task["direct"]==true {
            task["progress"]=json!(99);task["message"]=json!("正在自动导出 PDF");lib.put_task(&task)?;let _=app.emit("task-changed",task.clone());
            if let Err(error)=export(&app,&lib,&json!({"id":material["id"]}),true){
                let _=lib.put_task(&json!({"id":uuid::Uuid::new_v4().simple().to_string(),"type":"export","title":material["title"],"status":"failed","progress":0,"message":"自动导出失败","materialId":material["id"],"error":error}));
            }
        }
        Ok::<Value,String>(material)
    })();
    match result {
        Ok(material)=>{task["status"]=json!("done");task["progress"]=json!(100);task["message"]=json!("下载完成");task["materialId"]=material["id"].clone();}
        Err(error)=>{task["status"]=json!(if error=="已取消"{"cancelled"}else{"failed"});task["error"]=json!(error);task["message"]=json!("下载未完成");}
    }
    let _=lib.put_task(&task);
    if let Ok(mut runtime)=app.state::<AppState>().runtime.lock(){runtime.controls.remove(&id);}
    let _=sync(&app,&lib);
}
fn task_action(app:&AppHandle,lib:&Library,data:&Value)->Result<Value,String>{
    let task_id=required(data,"id")?;
    let mut task=lib.tasks()?.into_iter().find(|t|t["id"]==task_id).ok_or("任务不存在。")?;
    let state=app.state::<AppState>();
    let control={state.runtime.lock().map_err(|_|"运行状态无法读取。")?.controls.get(task_id).cloned()};
    match text(data,"action") {
        "toggle" => {let control=control.ok_or("此任务已结束。")?;let paused=!control.paused.load(Ordering::SeqCst);control.paused.store(paused,Ordering::SeqCst);task["status"]=json!(if paused{"paused"}else if control.started.load(Ordering::SeqCst){"running"}else{"queued"});lib.put_task(&task)?;sync(app,lib)?;Ok(json!(true))}
        "cancel" => {let control=control.ok_or("此任务已结束。")?;control.cancelled.store(true,Ordering::SeqCst);control.paused.store(false,Ordering::SeqCst);task["message"]=json!(if control.started.load(Ordering::SeqCst){"正在取消，等待当前页面请求完成…"}else{"正在从队列移除…"});lib.put_task(&task)?;sync(app,lib)?;Ok(json!(true))}
        "retry" => {
            if task["status"]!="failed"&&task["status"]!="cancelled" {return Err("仅可重试失败或取消的任务。".into());}
            match text(&task,"type") {
                "download" => {let course=task["course"].clone();let state=app.state::<AppState>();let mut runtime=state.runtime.lock().map_err(|_|"运行状态无法读取。")?;
                    let auth=runtime.auth.as_ref().ok_or("请先重新连接学校平台。")?;
                    let expected=crate::platform::identity("scut",&[&auth.tenant,&auth.user,text(&course,"course_id"),text(&course,"sub_id")]);
                    if expected!=text(&course,"id"){return Err("请使用获取这份课件时的学校账号登录。".into());}
                    if !runtime.courses.iter().any(|c|c["id"]==course["id"]){runtime.courses.push(course.clone());}
                    drop(runtime);download(app,lib,&json!({"ids":[course["id"]],"direct":task["direct"]==true}))
                }
                "export" => export(app,lib,&json!({"id":task["materialId"]}),true),
                "import" => {
                    if state.import_busy.swap(true,Ordering::SeqCst){return Err("已有导入任务正在进行，请稍后再试。".into());}
                    let result=(||{
                        let paths=task["paths"].as_array().ok_or("原始文件记录已损坏，请重新选择文件。")?
                            .iter().map(|v|v.as_str().map(PathBuf::from).ok_or("原始文件记录已损坏。".to_string())).collect::<Result<Vec<_>,_>>()?;
                        start_import_job(app,Arc::new(Library{root:lib.root.clone()}),text(&task,"kind")=="folder",paths,
                            task["courseId"].as_str().map(str::to_owned))
                    })();
                    if result.is_err(){state.import_busy.store(false,Ordering::SeqCst);}
                    result
                }
                _ => Err("请重新发起该操作。".into()),
            }
        }
        _ => Err("任务操作无效。".into())
    }
}
fn import(app:&AppHandle,lib:&Library,data:&Value)->Result<Value,String>{
    let state=app.state::<AppState>();
    if state.import_busy.swap(true,Ordering::SeqCst){return Err("已有导入窗口或导入任务正在进行，请在任务页查看进度。".into());}
    let busy=state.import_busy.clone();
    let result=(||{
        let folder=text(data,"kind")=="folder";
        let paths=if folder{rfd::FileDialog::new().set_title("选择图片课件目录").pick_folder().map(|p|vec![p])}
            else{rfd::FileDialog::new().set_title("选择 PDF 或课件图片").add_filter("课件",&["pdf","jpg","jpeg","png","webp","bmp","tif","tiff"]).pick_files()};
        let Some(paths)=paths else{return Ok(json!(false))};
        start_import_job(app,Arc::new(Library{root:lib.root.clone()}),folder,paths,data["courseId"].as_str().filter(|s|!s.is_empty()).map(str::to_owned))
    })();
    if result.is_err()||result.as_ref().is_ok_and(|v|v==false){busy.store(false,Ordering::SeqCst);}
    result
}
fn start_import_job(app:&AppHandle,lib:Arc<Library>,folder:bool,paths:Vec<PathBuf>,course_id:Option<String>)->Result<Value,String>{
    if paths.is_empty(){return Err("没有选择文件。".into());}
    let state=app.state::<AppState>();
    let id=uuid::Uuid::new_v4().simple().to_string();
    let title=if folder{paths[0].file_name().and_then(|n|n.to_str()).unwrap_or("本地目录").to_string()}else if paths.len()==1{paths[0].file_name().and_then(|n|n.to_str()).unwrap_or("本地文件").to_string()}else{format!("导入 {} 个文件",paths.len())};
    let mut task=json!({"id":id,"type":"import","title":title,"status":"running","progress":0,"message":"正在读取文件列表…","error":"","paths":paths,"kind":if folder{"folder"}else{"files"},"courseId":course_id});
    let control=Arc::new(TaskControl::new());
    lib.put_task(&task)?;
    state.runtime.lock().map_err(|_|"运行状态无法读取。")?.controls.insert(id.clone(),control.clone());
    let _=sync(app,&lib);
    let app_handle=app.clone();let busy=state.import_busy.clone();
    std::thread::spawn(move||{
        let result=run_import(&app_handle,&lib,&mut task,&control,folder,&paths,course_id.as_deref());
        match result {
            Ok(count)=>{task["status"]=json!("done");task["progress"]=json!(100);task["message"]=json!(format!("已导入 {count} 份课件"));}
            Err(error)=>{task["status"]=json!(if error=="已取消"{"cancelled"}else{"failed"});task["error"]=json!(error);task["message"]=json!("导入未完成");}
        }
        let _=lib.put_task(&task);let _=sync(&app_handle,&lib);
        if let Ok(mut runtime)=app_handle.state::<AppState>().runtime.lock(){runtime.controls.remove(&id);}
        busy.store(false,Ordering::SeqCst);
    });
    Ok(json!(true))
}
fn run_import(app:&AppHandle,lib:&Library,task:&mut Value,control:&TaskControl,folder:bool,paths:&[PathBuf],cid:Option<&str>)->Result<usize,String>{
    if control.cancelled.load(Ordering::SeqCst){return Err("已取消".into());}
    let mut groups:Vec<Vec<PathBuf>>=Vec::new();let mut pdfs:Vec<PathBuf>=Vec::new();
    if folder {
        let root=paths.first().ok_or("目录无效。")?;
        let dirs=std::iter::once(root.clone()).chain(fs::read_dir(root).map_err(|e|e.to_string())?.filter_map(Result::ok).map(|e|e.path()).filter(|p|p.is_dir()));
        for path in dirs {
            let mut images=Vec::new();let mut local_pdfs=Vec::new();
            for entry in fs::read_dir(&path).map_err(|e|e.to_string())? {let p=entry.map_err(|e|e.to_string())?.path();if p.is_file(){if is_image(&p){images.push(p)}else if is_pdf(&p){local_pdfs.push(p)}}}
            images.sort();local_pdfs.sort();if !images.is_empty(){groups.push(images)}else{pdfs.extend(local_pdfs)}
        }
    }else{
        pdfs=paths.iter().filter(|p|is_pdf(p)).cloned().collect();
        let images:Vec<_>=paths.iter().filter(|p|is_image(p)).cloned().collect();if !images.is_empty(){groups.push(images)}
    }
    if control.cancelled.load(Ordering::SeqCst){return Err("已取消".into());}
    let total=groups.len()+pdfs.len();if total==0{return Err("没有找到可导入的图片或 PDF。".into());}
    let mut done=0;
    for group in groups {
        let title=group[0].parent().and_then(|p|p.file_name()).and_then(|s|s.to_str()).unwrap_or("图片课件").to_string();
        task["message"]=json!(format!("正在处理图片课件：{title}"));lib.put_task(task)?;let _=app.emit("task-changed",task.clone());
        let m=lib.import_images_with_progress(&group,cid,|page,pages|update_import_progress(app,lib,task,control,done,total,page,pages,&title))?;
        task["materialId"]=m["id"].clone();done+=1;sync(app,lib)?;
    }
    for pdf in pdfs {
        let title=pdf.file_name().and_then(|s|s.to_str()).unwrap_or("PDF").to_string();
        task["message"]=json!(format!("正在打开 PDF：{title}"));lib.put_task(task)?;let _=app.emit("task-changed",task.clone());
        let m=crate::pdf::import_pdf_with_progress(lib,&pdf,cid,|page,pages|update_import_progress(app,lib,task,control,done,total,page,pages,&title))?;
        task["materialId"]=m["id"].clone();done+=1;sync(app,lib)?;
    }
    Ok(done)
}
fn update_import_progress(app:&AppHandle,lib:&Library,task:&mut Value,control:&TaskControl,done:usize,total:usize,page:usize,pages:usize,title:&str)->Result<(),String>{
    while control.paused.load(Ordering::SeqCst)&&!control.cancelled.load(Ordering::SeqCst){std::thread::sleep(std::time::Duration::from_millis(150));}
    if control.cancelled.load(Ordering::SeqCst){return Err("已取消".into());}
    let percent=((done as f64+page as f64/pages.max(1) as f64)*99.0/total as f64) as u64;
    if task["progress"].as_u64()!=Some(percent)||page==pages {
        task["progress"]=json!(percent);task["message"]=json!(format!("{} · 第 {page}/{pages} 页 · 第 {}/{} 份",title,done+1,total));
        lib.put_task(task)?;let _=app.emit("task-changed",task.clone());
    }
    Ok(())
}
fn export(app:&AppHandle,lib:&Library,data:&Value,quick:bool)->Result<Value,String>{
    let state=app.state::<AppState>();
    let _export=state.export_lock.lock().map_err(|_|"导出队列无法使用。")?;
    let mid=required(data,"id")?;let m=lib.get_material(mid)?;if m["deleted"]==true{return Err("请先恢复课件。".into());}
    let mut settings=lib.setting("settings",json!({}))?;
    let root=if let Some(configured)=settings["exportDir"].as_str().filter(|s|!s.is_empty()){PathBuf::from(configured)}else{
        let Some(chosen)=rfd::FileDialog::new().set_title("选择 PDF 导出目录").pick_folder() else{return Ok(json!(false))};
        settings["exportDir"]=json!(chosen.display().to_string());lib.set_setting("settings",&settings)?;chosen
    };
    fs::create_dir_all(&root).map_err(|e|e.to_string())?;
    let course=lib.courses()?.into_iter().find(|c|c["id"]==m["courseId"]);
    let course_name=course.as_ref().and_then(|c|c["title"].as_str()).unwrap_or("未归类");
    let dir=root.join(safe_name(course_name));fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
    let default_name=format!("{}_{}",text(&m,"day"),text(&m,"title"));
    let filename=if quick{safe_name(&default_name)}else{safe_name(data["name"].as_str().unwrap_or(&default_name))};
    let mut dest=dir.join(format!("{filename}.pdf"));let mut n=2;while dest.exists(){dest=dir.join(format!("{filename} ({n}).pdf"));n+=1;}
    if m["kind"]=="pdf"{crate::pdf::export_original_pdf(lib,&m,&dest)?;}else{crate::pdf::export_images(lib,&m,&dest)?;}
    lib.update_material(mid,&json!({"exported":true,"exportRevision":m["revision"],"exportName":dest.file_name().unwrap().to_string_lossy(),"exportPath":dest.display().to_string()}))?;
    lib.put_task(&json!({"id":uuid::Uuid::new_v4().simple().to_string(),"type":"export","title":m["title"],"status":"done","progress":100,"message":"导出完成","materialId":mid,"error":""}))?;
    sync(app,lib)?;Ok(json!(dest.display().to_string()))
}
fn is_pdf(path:&Path)->bool{path.extension().and_then(|s|s.to_str()).map(|s|s.eq_ignore_ascii_case("pdf")).unwrap_or(false)}
fn batch_export(app:&AppHandle,lib:&Library,data:&Value)->Result<Value,String>{
    let ids=data["ids"].as_array().ok_or("课件列表无效。")?;
    if ids.is_empty(){return Err("请先选择课件。".into());}
    if text(data,"mode")=="combined" {
        let state=app.state::<AppState>();
        let _export=state.export_lock.lock().map_err(|_|"导出队列无法使用。")?;
        let mut materials=Vec::new();for mid in ids {materials.push(lib.get_material(mid.as_str().ok_or("课件编号无效。")?)?);}
        materials.sort_by(|a,b|text(a,"day").cmp(text(b,"day")));
        let mut settings=lib.setting("settings",json!({}))?;
        let root=if let Some(path)=settings["exportDir"].as_str().filter(|s|!s.is_empty()){PathBuf::from(path)}else{
            let Some(path)=rfd::FileDialog::new().set_title("选择 PDF 导出目录").pick_folder() else{return Ok(json!(false))};
            settings["exportDir"]=json!(path.display().to_string());lib.set_setting("settings",&settings)?;path};
        let course=lib.courses()?.into_iter().find(|c|c["id"]==materials[0]["courseId"]);
        let title=course.as_ref().and_then(|c|c["title"].as_str()).unwrap_or("未归类");
        let dir=root.join(safe_name(title));fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
        let basename=format!("{}_合并课件",safe_name(title));let mut dest=dir.join(format!("{basename}.pdf"));let mut n=2;while dest.exists(){dest=dir.join(format!("{basename} ({n}).pdf"));n+=1;}
        crate::pdf::export_combined(lib,&materials,&dest)?;
        let path=dest.display().to_string();
        for m in &materials {lib.update_material(required(m,"id")?,&json!({"exported":true,"exportRevision":m["revision"],"exportName":dest.file_name().unwrap().to_string_lossy(),"exportPath":path}))?;}
        lib.put_task(&json!({"id":uuid::Uuid::new_v4().simple().to_string(),"type":"batch","title":format!("{} · 合并 {} 份课件",title,materials.len()),"status":"done","progress":100,"message":"导出完成","materialId":materials[0]["id"],"error":""}))?;
        sync(app,lib)?;return Ok(json!(true));
    }
    for id in ids {if export(app,lib,&json!({"id":id}),true)?==false{return Ok(json!(false));}}
    Ok(json!(true))
}
