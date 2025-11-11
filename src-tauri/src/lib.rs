use tauri::Manager;

// 窗口拖拽命令
#[tauri::command]
async fn start_drag(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

// 获取窗口位置
#[tauri::command]
async fn get_window_position(window: tauri::Window) -> Result<(i32, i32), String> {
    let position = window.outer_position().map_err(|e| e.to_string())?;
    Ok((position.x, position.y))
}

// 设置窗口位置
#[tauri::command]
async fn set_window_position(window: tauri::Window, x: i32, y: i32) -> Result<(), String> {
    use tauri::Position;
    window.set_position(Position::Physical(tauri::PhysicalPosition { x, y }))
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            start_drag,
            get_window_position,
            set_window_position
        ])
        .setup(|app| {
            // 获取主窗口
            let window = app.get_webview_window("main").unwrap();
            
            // 设置窗口为始终置顶
            window.set_always_on_top(true).unwrap();
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
