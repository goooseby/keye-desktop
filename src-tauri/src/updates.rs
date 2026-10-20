use serde::{Deserialize,Serialize};
use serde_json::Value;
use std::{fs,path::Path,sync::Mutex};

#[derive(Debug,Serialize,Deserialize)]
#[serde(default,rename_all="camelCase")]
pub struct Preferences {
    auto_check:bool,
    ignored_version:String,
    remind_version:String,
    remind_after:u64,
}
impl Default for Preferences {
    fn default()->Self{Self{auto_check:true,ignored_version:String::new(),remind_version:String::new(),remind_after:0}}
}
pub fn load(base:&Path)->Preferences{
    fs::read(base.join("update-settings.json")).ok().and_then(|data|serde_json::from_slice(&data).ok()).unwrap_or_default()
}
static SAVE_LOCK:Mutex<()>=Mutex::new(());
pub fn save(base:&Path,patch:&Value)->Result<Preferences,String>{
    let _guard=SAVE_LOCK.lock().map_err(|_|"更新设置暂时无法保存。")?;
    let mut preferences=load(base);
    if let Some(value)=patch.get("autoCheck"){preferences.auto_check=value.as_bool().ok_or("自动检查设置无效。")?;}
    for (key,target) in [("ignoredVersion",&mut preferences.ignored_version),("remindVersion",&mut preferences.remind_version)]{
        if let Some(value)=patch.get(key){
            let version=value.as_str().filter(|s|s.len()<=80&&!s.chars().any(char::is_control)).ok_or("更新版本设置无效。")?;
            *target=version.to_owned();
        }
    }
    if let Some(value)=patch.get("remindAfter"){preferences.remind_after=value.as_u64().ok_or("提醒时间无效。")?;}
    fs::create_dir_all(base).map_err(|e|e.to_string())?;
    let temporary=base.join("update-settings.json.part");
    fs::write(&temporary,serde_json::to_vec(&preferences).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    fs::rename(temporary,base.join("update-settings.json")).map_err(|e|e.to_string())?;
    Ok(preferences)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn update_preferences_survive_restart_and_preserve_library_configuration(){
        let base=Path::new(env!("CARGO_MANIFEST_DIR")).join("../.build/test-data").join(uuid::Uuid::new_v4().simple().to_string());
        fs::create_dir_all(&base).unwrap();let library_config=b"{\"libraryDir\":\"a-separate-library\"}";fs::write(base.join("app-settings.json"),library_config).unwrap();
        assert!(load(&base).auto_check);
        save(&base,&json!({"autoCheck":false,"ignoredVersion":"0.3.0"})).unwrap();
        save(&base,&json!({"remindVersion":"0.4.0","remindAfter":1900000000000_u64})).unwrap();
        let saved=load(&base);assert!(!saved.auto_check);assert_eq!(saved.ignored_version,"0.3.0");assert_eq!(saved.remind_version,"0.4.0");
        assert_eq!(fs::read(base.join("app-settings.json")).unwrap(),library_config);
        assert!(save(&base,&json!({"autoCheck":"invalid"})).is_err());assert!(!load(&base).auto_check);
        fs::remove_dir_all(base).unwrap();
    }
}
