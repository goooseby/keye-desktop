use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::{BTreeMap, HashSet}, fs, io::Read, path::Path, sync::Mutex, time::{Duration, SystemTime, UNIX_EPOCH}};

const ENDPOINT: &str = "https://keye.kovra.top/desktop/announcements.json";
const LIMIT: u64 = 256 * 1024;
static LOCK: Mutex<()> = Mutex::new(());
fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Announcement {
    id: String,
    #[serde(default="revision_one")] revision: u32,
    title: String,
    body: String,
    published_at: String,
    #[serde(default)] expires_at: Option<String>,
    #[serde(default="general")] kind: String,
    #[serde(default)] version: Option<String>,
    #[serde(default)] min_version: Option<String>,
    #[serde(default)] max_version: Option<String>,
}
fn revision_one() -> u32 { 1 }
fn general() -> String { "general".into() }
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
struct Feed { schema_version: u32, announcements: Vec<Announcement> }
#[derive(Default, Serialize, Deserialize)]
#[serde(default, rename_all="camelCase")]
struct Receipt { read: bool, remind_after: u64 }
#[derive(Serialize, Deserialize)]
#[serde(default, rename_all="camelCase")]
struct Store {
    items: Vec<Announcement>, receipts: BTreeMap<String, Receipt>, checked_at: u64,
    attempted_at: u64, auto_show: bool,
}
impl Default for Store {
    fn default() -> Self { Self { items: vec![], receipts: BTreeMap::new(), checked_at: 0, attempted_at: 0, auto_show: true } }
}
fn version(value: &str) -> Result<[u64; 3], String> {
    let parts: Vec<_> = value.split('.').collect();
    if parts.len()!=3 { return Err("公告版本号应使用 x.y.z 格式。".into()); }
    let mut result=[0;3];
    for (i, part) in parts.iter().enumerate() {
        if part.is_empty() || !part.bytes().all(|b|b.is_ascii_digit()) { return Err("公告版本号无效。".into()); }
        result[i]=part.parse().map_err(|_|"公告版本号无效。")?;
    }
    Ok(result)
}
fn timestamp(value: &str) -> Result<i64, String> {
    chrono::DateTime::parse_from_rfc3339(value).map(|d|d.timestamp_millis()).map_err(|_|"公告日期无效。".into())
}
pub fn parse(raw: &[u8]) -> Result<Vec<Announcement>, String> {
    if raw.len() as u64>LIMIT { return Err("公告内容过大。".into()); }
    let feed: Feed=serde_json::from_slice(raw).map_err(|_|"公告格式无效。")?;
    if feed.schema_version!=1 || feed.announcements.len()>50 { return Err("暂不支持此公告格式。".into()); }
    let mut ids=HashSet::new();
    for item in &feed.announcements {
        if item.id.is_empty() || item.id.len()>80 || !item.id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'_'||b==b'-') || !ids.insert(&item.id) || item.revision==0 { return Err("公告编号无效。".into()); }
        if item.title.trim().is_empty() || item.title.chars().count()>100 || item.body.trim().is_empty() || item.body.chars().count()>12000 { return Err("公告内容无效。".into()); }
        let published=timestamp(&item.published_at)?;
        if let Some(expires)=&item.expires_at { if timestamp(expires)?<=published { return Err("公告有效期无效。".into()); } }
        if !matches!(item.kind.as_str(),"general"|"update") { return Err("公告类型无效。".into()); }
        if item.kind=="update" && item.version.is_none() { return Err("更新公告缺少版本号。".into()); }
        for v in [&item.version,&item.min_version,&item.max_version].into_iter().flatten() { version(v)?; }
        if let (Some(min),Some(max))=(&item.min_version,&item.max_version) { if version(min)?>version(max)? { return Err("公告版本范围无效。".into()); } }
    }
    Ok(feed.announcements)
}
fn applicable(item: &Announcement, current: &str, at: u64) -> bool {
    let Ok(current)=version(current) else { return false; };
    timestamp(&item.published_at).is_ok_and(|date|date<=at as i64)
        && item.min_version.as_ref().is_none_or(|v|version(v).is_ok_and(|v|current>=v))
        && item.max_version.as_ref().is_none_or(|v|version(v).is_ok_and(|v|current<=v))
}
fn load(base: &Path) -> Store {
    fs::read(base.join("announcements-state.json")).ok().and_then(|raw|serde_json::from_slice(&raw).ok()).unwrap_or_default()
}
pub fn preferences(base: &Path) -> Value { json!({"autoShow":load(base).auto_show}) }
fn save(base: &Path, store: &Store) -> Result<(),String> {
    fs::create_dir_all(base).map_err(|e|e.to_string())?;
    let temporary=base.join("announcements-state.json.part");
    fs::write(&temporary,serde_json::to_vec(store).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    fs::rename(temporary,base.join("announcements-state.json")).map_err(|e|e.to_string())
}
fn view(store: &Store, current: &str, at: u64, error: Option<String>) -> Value {
    let mut items:Vec<_>=store.items.iter().filter(|item|applicable(item,current,at)).collect();
    items.sort_by(|a,b|timestamp(&b.published_at).unwrap_or(0).cmp(&timestamp(&a.published_at).unwrap_or(0)).then(a.id.cmp(&b.id)));
    let items:Vec<_>=items.into_iter().map(|item| {
        let key=format!("{}:{}",item.id,item.revision);
        let mut value=serde_json::to_value(item).unwrap();
        value["key"]=json!(key); value["read"]=json!(store.receipts.get(&key).is_some_and(|r|r.read));
        value["remindAfter"]=json!(store.receipts.get(&key).map_or(0,|r|r.remind_after));
        value["expired"]=json!(item.expires_at.as_ref().is_some_and(|v|timestamp(v).is_ok_and(|date|date<=at as i64)));
        value
    }).collect();
    json!({"items":items,"autoShow":store.auto_show,"checkedAt":store.checked_at,"error":error,"endpoint":ENDPOINT})
}
fn fetch() -> Result<Vec<Announcement>,String> {
    let response=reqwest::blocking::Client::builder().timeout(Duration::from_secs(8)).redirect(reqwest::redirect::Policy::none())
        .build().map_err(|_|"无法连接公告服务。")?.get(ENDPOINT).header("Accept","application/json").header("Cache-Control","no-cache")
        .send().map_err(|_|"暂时无法获取公告，请稍后重试。")?;
    if response.status()!=reqwest::StatusCode::OK { return Err("公告服务暂不可用。".into()); }
    if response.content_length().is_some_and(|size|size>LIMIT) { return Err("公告内容过大。".into()); }
    let mut raw=Vec::new();response.take(LIMIT+1).read_to_end(&mut raw).map_err(|_|"公告读取失败。")?;
    parse(&raw)
}
pub fn get(base: &Path, manual: bool) -> Result<Value,String> {
    let _guard=LOCK.lock().map_err(|_|"公告暂不可用。")?;
    let mut store=load(base);let at=now();let mut error=None;
    let recent=store.checked_at>0&&at.saturating_sub(store.checked_at)<6*60*60*1000;
    let backoff=store.attempted_at>0&&at.saturating_sub(store.attempted_at)<15*60*1000;
    if manual || (!recent&&!backoff) {
        store.attempted_at=at;
        match fetch() { Ok(items)=>{store.items=items;store.checked_at=at;}, Err(message)=>error=Some(message) }
        save(base,&store)?;
    }
    Ok(view(&store,env!("CARGO_PKG_VERSION"),at,error))
}
pub fn receipt(base: &Path, data: &Value) -> Result<Value,String> {
    let _guard=LOCK.lock().map_err(|_|"公告暂不可用。")?;
    let mut store=load(base);let at=now();
    if let Some(value)=data.get("autoShow") { store.auto_show=value.as_bool().ok_or("公告提醒设置无效。")?; }
    else {
        let key=data["key"].as_str().ok_or("公告编号无效。")?;
        let known=store.items.iter().any(|item|format!("{}:{}",item.id,item.revision)==key);
        if !known { return Err("公告已撤下，请刷新公告列表。".into()); }
        match data["action"].as_str() {
            Some("read")=>{store.receipts.insert(key.into(),Receipt{read:true,remind_after:0});},
            Some("later")=>{store.receipts.entry(key.into()).or_default().remind_after=at+24*60*60*1000;},
            _=>return Err("公告操作无效。".into()),
        }
    }
    // Receipts live outside the library and remain bounded even after years of announcements.
    let known:HashSet<_>=store.items.iter().map(|item|format!("{}:{}",item.id,item.revision)).collect();
    store.receipts.retain(|key,_|known.contains(key));save(base,&store)?;
    Ok(view(&store,env!("CARGO_PKG_VERSION"),at,None))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn feed() -> Value { json!({"schemaVersion":1,"announcements":[{"id":"hello","title":"公告","body":"正文 <script>不执行</script>","publishedAt":"2026-01-01T00:00:00Z","minVersion":"0.2.0"}]}) }
    #[test]
    fn validates_schema_dates_ranges_duplicates_and_update_versions() {
        let raw=feed();assert!(parse(&serde_json::to_vec(&raw).unwrap()).is_ok());
        for patch in [json!({"revision":0}),json!({"expiresAt":"2025-01-01T00:00:00Z"}),json!({"minVersion":"0.5.0","maxVersion":"0.2.0"}),json!({"kind":"update"}),json!({"id":"bad/id"})] {
            let mut invalid=raw.clone();for (key,value) in patch.as_object().unwrap(){invalid["announcements"][0][key]=value.clone();}assert!(parse(&serde_json::to_vec(&invalid).unwrap()).is_err());
        }
        let mut duplicate=raw.clone();duplicate["announcements"].as_array_mut().unwrap().push(raw["announcements"][0].clone());assert!(parse(&serde_json::to_vec(&duplicate).unwrap()).is_err());
        assert!(parse(&vec![b' ';LIMIT as usize+1]).is_err());
    }
    #[test]
    fn filters_future_and_version_mismatch_but_keeps_expired_history() {
        let mut raw=feed();raw["announcements"][0]["expiresAt"]=json!("2026-02-01T00:00:00Z");
        let store=Store{items:parse(&serde_json::to_vec(&raw).unwrap()).unwrap(),..Store::default()};let at=timestamp("2026-11-14T00:00:00Z").unwrap() as u64;
        assert_eq!(view(&store,"0.5.0",at,None)["items"][0]["expired"],true);
        assert!(view(&store,"0.1.0",at,None)["items"].as_array().unwrap().is_empty());
        assert!(view(&store,"0.5.0",0,None)["items"].as_array().unwrap().is_empty());
    }
    #[test]
    fn receipts_survive_restart_and_do_not_modify_library_or_update_preferences() {
        let base=Path::new(env!("CARGO_MANIFEST_DIR")).join("../.build/test-data").join(uuid::Uuid::new_v4().simple().to_string());
        fs::create_dir_all(&base).unwrap();fs::write(base.join("update-settings.json"),b"unchanged").unwrap();
        let mut store=Store{items:parse(&serde_json::to_vec(&feed()).unwrap()).unwrap(),..Store::default()};save(&base,&store).unwrap();
        receipt(&base,&json!({"key":"hello:1","action":"read"})).unwrap();assert!(load(&base).receipts["hello:1"].read);
        store=load(&base);store.items[0].revision=2;save(&base,&store).unwrap();
        assert_eq!(view(&load(&base),"0.5.0",now(),None)["items"][0]["read"],false);
        receipt(&base,&json!({"key":"hello:2","action":"later"})).unwrap();assert!(load(&base).receipts["hello:2"].remind_after>now());
        receipt(&base,&json!({"autoShow":false})).unwrap();assert_eq!(preferences(&base)["autoShow"],false);
        assert!(receipt(&base,&json!({"key":"unknown:1","action":"read"})).is_err());
        assert_eq!(fs::read(base.join("update-settings.json")).unwrap(),b"unchanged");fs::remove_dir_all(base).unwrap();
    }
}
