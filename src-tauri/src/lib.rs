use tauri::{Manager, Emitter};

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
            
            // 启动鼠标位置轮询线程，解决失焦状态下无法检测 Hover 的问题
            let win_clone = window.clone();
            std::thread::spawn(move || {
                let mut was_hovered = false;
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                    
                    // 获取必要参数
                    let mouse_ret = win_clone.cursor_position();
                    let win_pos_ret = win_clone.outer_position();
                    let win_size_ret = win_clone.inner_size();
                    
                    let is_hovered = if let (Ok(mouse), Ok(win_pos), Ok(size)) = (mouse_ret, win_pos_ret, win_size_ret) {
                        // 调试日志：确认坐标系 (打印过于频繁会刷屏，仅在状态变化或特定条件下打印建议开启)
                        // println!("Mouse: {:?}, Win: {:?}, Size: {:?}", mouse, win_pos, size);
                        
                        // 逻辑修正：Tauri 的 cursor_position 返回的是物理屏幕坐标 (PhysicalPosition)
                        // 我们需要判断鼠标是否落在窗口矩形内
                        let rel_x = mouse.x - win_pos.x as f64;
                        let rel_y = mouse.y - win_pos.y as f64;
                        
                        rel_x >= 0.0 && rel_x <= size.width as f64 &&
                        rel_y >= 0.0 && rel_y <= size.height as f64
                    } else {
                        false
                    };
                    
                    if is_hovered != was_hovered {
                        // println!("Hover change detected: {} (Mouse in window: {})", is_hovered, is_hovered);
                        let _ = win_clone.emit("hover-change", is_hovered);
                        was_hovered = is_hovered;
                    }
                }
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
