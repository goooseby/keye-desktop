use image::ImageFormat;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

pub struct Library {
    pub root: PathBuf,
}

fn err(e: impl std::fmt::Display) -> String { e.to_string() }
fn now() -> u128 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() }
fn id() -> String { Uuid::new_v4().simple().to_string() }

impl Library {
    pub fn open(root: PathBuf) -> Result<Self, String> {
        let existing=root.join("library.sqlite");
        if existing.exists() {
            let db=Connection::open_with_flags(&existing,rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(err)?;
            let version:i64=db.query_row("PRAGMA user_version",[],|r|r.get(0)).map_err(err)?;
            if version>1{return Err("此目录属于其他版本的资料库，请选择新的目录；原始数据未被修改。".into());}
        }
        fs::create_dir_all(root.join("materials")).map_err(err)?;
        fs::create_dir_all(root.join("exports")).map_err(err)?;
        let library = Self { root };
        let db = library.db()?;
        db.execute_batch("CREATE TABLE IF NOT EXISTS materials(id TEXT PRIMARY KEY, source_key TEXT UNIQUE, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS courses(id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, data TEXT NOT NULL);").map_err(err)?;
        let version:i64=db.query_row("PRAGMA user_version",[],|r|r.get(0)).map_err(err)?;
        if version>1{return Err("资料库由更新的课页版本创建，当前版本无法打开。".into());}
        if version==0{db.execute_batch("PRAGMA user_version=1;").map_err(err)?;}
        drop(db);
        for mut task in library.tasks()? {if matches!(task["status"].as_str(),Some("queued"|"running"|"paused")) {
            task["status"]=json!("failed");task["error"]=json!("程序上次退出时任务尚未完成，请重试。");library.put_task(&task)?;
        }}
        Ok(library)
    }

    fn db(&self) -> Result<Connection, String> {
        let db=Connection::open(self.root.join("library.sqlite")).map_err(err)?;
        db.busy_timeout(std::time::Duration::from_secs(5)).map_err(err)?;
        Ok(db)
    }
    fn all(&self, table: &str) -> Result<Vec<Value>, String> {
        let db = self.db()?;
        let mut stmt = db.prepare(&format!("SELECT data FROM {table} ORDER BY rowid")).map_err(err)?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(err)?;
        rows.map(|row| serde_json::from_str(&row.map_err(err)?).map_err(err)).collect()
    }
    pub fn materials(&self) -> Result<Vec<Value>, String> { self.all("materials") }
    pub fn courses(&self) -> Result<Vec<Value>, String> { self.all("courses") }
    pub fn tasks(&self) -> Result<Vec<Value>, String> { self.all("tasks") }
    pub fn setting(&self, key: &str, fallback: Value) -> Result<Value, String> {
        let db = self.db()?;
        let raw: Option<String> = db.query_row("SELECT value FROM settings WHERE key=?1", [key], |r| r.get(0)).optional().map_err(err)?;
        raw.map(|s| serde_json::from_str(&s).map_err(err)).unwrap_or(Ok(fallback))
    }
    pub fn set_setting(&self, key: &str, value: &Value) -> Result<(), String> {
        self.db()?.execute("INSERT OR REPLACE INTO settings(key,value) VALUES(?1,?2)", params![key, value.to_string()]).map_err(err)?;
        Ok(())
    }
    pub fn get_material(&self, mid: &str) -> Result<Value, String> {
        let db = self.db()?;
        let raw: String = db.query_row("SELECT data FROM materials WHERE id=?1", [mid], |r| r.get(0)).map_err(|_| "未找到这份课件。".to_string())?;
        serde_json::from_str(&raw).map_err(err)
    }
    pub fn put_material(&self, m: &Value) -> Result<(), String> {
        self.db()?.execute("INSERT INTO materials(id,source_key,data) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET source_key=excluded.source_key,data=excluded.data", params![m["id"].as_str(), m["sourceKey"].as_str(), m.to_string()]).map_err(err)?;
        Ok(())
    }
    pub fn put_task(&self, task: &Value) -> Result<(), String> {
        self.db()?.execute("INSERT OR REPLACE INTO tasks(id,data) VALUES(?1,?2)", params![task["id"].as_str(),task.to_string()]).map_err(err)?;
        Ok(())
    }
    pub fn put_tasks(&self, tasks: &[Value]) -> Result<(), String> {
        let mut db=self.db()?;
        let tx=db.transaction().map_err(err)?;
        for task in tasks {tx.execute("INSERT OR REPLACE INTO tasks(id,data) VALUES(?1,?2)",params![task["id"].as_str(),task.to_string()]).map_err(err)?;}
        tx.commit().map_err(err)
    }
    pub fn update_material(&self, mid: &str, changes: &Value) -> Result<Value, String> {
        let mut m = self.get_material(mid)?;
        for (key,value) in changes.as_object().ok_or("更新内容无效。")? { m[key] = value.clone(); }
        self.put_material(&m)?;
        Ok(m)
    }
    pub fn save_course(&self, input: &Value) -> Result<Value, String> {
        let title = input["title"].as_str().unwrap_or("").trim();
        if title.is_empty() { return Err("请填写课程名称。".into()); }
        let cid = input["id"].as_str().filter(|v| !v.is_empty()).map(str::to_owned).unwrap_or_else(id);
        let existing = self.courses()?.into_iter().find(|c| c["id"] == cid);
        let c = json!({"id":cid,"title":title.chars().take(120).collect::<String>(),"term":input["term"].as_str().unwrap_or("").trim().chars().take(80).collect::<String>(),
            "coverStyle":input["coverStyle"].as_str().or_else(||existing.as_ref().and_then(|c|c["coverStyle"].as_str())).unwrap_or(""),
            "coverPalette":input["coverPalette"].as_str().or_else(||existing.as_ref().and_then(|c|c["coverPalette"].as_str())).unwrap_or("")});
        self.db()?.execute("INSERT OR REPLACE INTO courses(id,data) VALUES(?1,?2)", params![cid,c.to_string()]).map_err(err)?;
        Ok(c)
    }
    pub fn selection(&self, mid: &str, excluded: &Value, revision: &Value) -> Result<(), String> {
        let mut db=self.db()?;
        let tx=db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(err)?;
        let raw:String=tx.query_row("SELECT data FROM materials WHERE id=?1",[mid],|r|r.get(0)).map_err(|_|"未找到这份课件。".to_string())?;
        let mut m:Value=serde_json::from_str(&raw).map_err(err)?;
        if m["revision"] != *revision { return Err("课件已更新，请重新打开后再整理。".into()); }
        let pages = m["pages"].as_u64().unwrap_or(0);
        let mut selected: Vec<u64> = excluded.as_array().ok_or("页面范围无效。")?.iter().map(|v|v.as_u64().filter(|n|*n>=1 && *n<=pages).ok_or("页面范围无效。".to_string())).collect::<Result<_,_>>()?;
        selected.sort_unstable(); selected.dedup();
        if m["excluded"] != json!(selected) {
            m["excluded"] = json!(selected); m["edited"] = json!(true); m["revision"] = json!(revision.as_u64().unwrap_or(0)+1); m["touched"] = json!(now());
            tx.execute("UPDATE materials SET data=?1 WHERE id=?2",params![m.to_string(),mid]).map_err(err)?;
        }
        tx.commit().map_err(err)?;
        Ok(())
    }
    pub fn import_images_with_progress<F>(&self, files: &[PathBuf], course_id: Option<&str>, mut progress: F) -> Result<Value, String>
    where F: FnMut(usize, usize) -> Result<(), String> {
        if files.is_empty() { return Err("没有可以导入的图片。".into()); }
        let mid = id();
        let dir = self.root.join("materials").join(&mid);
        fs::create_dir(&dir).map_err(err)?;
        let result = (|| {
            let mut records = Vec::new();
            for (index,path) in files.iter().enumerate() {
                let original = image::open(path).map_err(err)?;
                let n = index+1;
                let ext = path.extension().and_then(|s|s.to_str()).unwrap_or("jpg").to_ascii_lowercase();
                let dest = dir.join(format!("{n:05}.{ext}"));
                fs::copy(path,&dest).map_err(err)?;
                let preview = dir.join(format!("{n:05}-preview.jpg"));
                let thumb = dir.join(format!("{n:05}-thumb.jpg"));
                let scaled=original.thumbnail(1800,1800);
                scaled.save_with_format(&preview,ImageFormat::Jpeg).map_err(err)?;
                scaled.thumbnail(480,360).save_with_format(&thumb,ImageFormat::Jpeg).map_err(err)?;
                records.push(json!({"original":format!("materials/{mid}/{n:05}.{ext}"),"preview":format!("materials/{mid}/{n:05}-preview.jpg"),"thumb":format!("materials/{mid}/{n:05}-thumb.jpg")}));
                progress(n,files.len())?;
            }
            let title = files[0].parent().and_then(|p|p.file_name()).and_then(|s|s.to_str()).unwrap_or("本地课件");
            let day = chrono_day();
            let m = json!({"id":mid,"title":title,"topic":"本地资料","day":day,"pages":records.len(),"files":records,"sourceKey":format!("local:{mid}"),"source":"import","kind":"image","courseId":course_id,
                "excluded":[],"edited":false,"exported":false,"revision":0,"reviewRevision":null,"exportRevision":null,"exportName":"","exportPath":"","lastPage":1,"deleted":false,"touched":now()});
            self.put_material(&m)?;
            Ok(m)
        })();
        if result.is_err() { let _ = fs::remove_dir_all(&dir); }
        result
    }
    pub fn snapshot(&self) -> Result<Value, String> {
        let mut materials = self.materials()?;
        for m in &mut materials {
            let mid = m["id"].as_str().unwrap_or("");
            let media: Vec<Value> = m["files"].as_array().into_iter().flatten().enumerate().map(|(i,_)| json!({
                "src":format!("http://keye-media.localhost/{mid}/{}?size=preview",i+1),
                "thumb":format!("http://keye-media.localhost/{mid}/{}?size=thumb",i+1)})).collect();
            m["media"] = json!(media);
            m.as_object_mut().unwrap().remove("files");
        }
        let mut settings = self.setting("settings",json!({"exportMode":"review","exportDir":"","maxWorkers":2,"timeout":30,"retries":3,"sleepMs":100}))?;
        settings["maxWorkers"]=json!(settings["maxWorkers"].as_u64().unwrap_or(2).clamp(1,4));
        settings["libraryDir"] = json!(self.root.display().to_string());
        Ok(json!({"materials":materials,"courseLibrary":self.courses()?,"reviewQueue":self.setting("reviewQueue",json!([]))?,"tasks":self.tasks()?,"settings":settings,
            "lastMaterial":self.setting("lastMaterial",Value::Null)?,"loggedIn":false,"courses":[],"scanned":false,"scanError":"","appVersion":env!("CARGO_PKG_VERSION"),"packaged":false,"scanning":false}))
    }
    pub fn media_file(&self, mid: &str, page: usize, size: &str) -> Option<PathBuf> {
        if !mid.chars().all(|c| c.is_ascii_hexdigit()) || mid.len()!=32 || page==0 { return None; }
        let m = self.get_material(mid).ok()?;
        let key = if size=="thumb" {"thumb"} else {"preview"};
        let rel = m["files"].as_array()?.get(page-1)?[key].as_str()?;
        let path = self.root.join(rel);
        if path.parent()? != self.root.join("materials").join(mid) {return None;}
        Some(path)
    }
}

fn chrono_day() -> String { chrono::Local::now().format("%Y-%m-%d").to_string() }

pub fn is_image(path:&Path)->bool {matches!(path.extension().and_then(|x|x.to_str()).unwrap_or("").to_ascii_lowercase().as_str(),"jpg"|"jpeg"|"png"|"webp"|"bmp"|"tif"|"tiff")}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn local_library_survives_reopen_and_exports_selected_pages() {
        let root=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.build/test-data").join(id());
        let input=root.join("input");fs::create_dir_all(&input).unwrap();
        for i in 0..3 {let image=image::RgbImage::from_pixel(48,32,image::Rgb([i*80,120,200]));image.save(input.join(format!("{i}.png"))).unwrap();}
        let library=Library::open(root.join("library")).unwrap();
        let course=library.save_course(&json!({"title":"数学建模与优化","term":"测试学期"})).unwrap();
        let source:Vec<_>=(0..3).map(|i|input.join(format!("{i}.png"))).collect();
        let mut image_progress=Vec::new();
        let material=library.import_images_with_progress(&source,course["id"].as_str(),|done,total|{image_progress.push((done,total));Ok(())}).unwrap();
        assert_eq!(image_progress,vec![(1,3),(2,3),(3,3)]);
        library.selection(material["id"].as_str().unwrap(),&json!([2]),&json!(0)).unwrap();
        assert!(library.selection(material["id"].as_str().unwrap(),&json!([1]),&json!(0)).is_err());
        let updated=library.get_material(material["id"].as_str().unwrap()).unwrap();
        let output=root.join("output.pdf");crate::pdf::export_images(&library,&updated,&output).unwrap();
        assert_eq!(lopdf::Document::load(&output).unwrap().get_pages().len(),2);
        let mut pdf_progress=Vec::new();
        let imported_pdf=crate::pdf::import_pdf_with_progress(&library,&output,course["id"].as_str(),|done,total|{pdf_progress.push((done,total));Ok(())}).unwrap();
        assert_eq!(pdf_progress,vec![(1,2),(2,2)]);
        assert_eq!(imported_pdf["pages"],json!(2));
        library.selection(imported_pdf["id"].as_str().unwrap(),&json!([1]),&json!(0)).unwrap();
        let selected_pdf=library.get_material(imported_pdf["id"].as_str().unwrap()).unwrap();
        let filtered=root.join("filtered.pdf");crate::pdf::export_original_pdf(&library,&selected_pdf,&filtered).unwrap();
        assert_eq!(lopdf::Document::load(&filtered).unwrap().get_pages().len(),1);
        let combined=root.join("combined.pdf");crate::pdf::export_combined(&library,&[updated.clone(),selected_pdf],&combined).unwrap();
        assert_eq!(lopdf::Document::load(&combined).unwrap().get_pages().len(),3);
        assert!(source.iter().all(|p|p.exists()));
        let queued=(0..4).map(|i|json!({"id":format!("queued-{i}"),"type":"download","status":"queued","title":format!("课次 {i}")})).collect::<Vec<_>>();
        library.put_tasks(&queued).unwrap();
        assert_eq!(library.snapshot().unwrap()["tasks"].as_array().unwrap().len(),4);
        drop(library);
        let again=Library::open(root.join("library")).unwrap();
        assert_eq!(again.get_material(material["id"].as_str().unwrap()).unwrap()["excluded"],json!([2]));
        assert_eq!(again.courses().unwrap().len(),1);
        assert!(again.tasks().unwrap().iter().all(|task|task["status"]=="failed"));
        fs::remove_dir_all(root).unwrap();
    }
}
