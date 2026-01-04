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

#[derive(Clone, serde::Serialize)]
struct MousePosPayload {
    x: f64,
    y: f64,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_process::init())
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
                    // 动态调整轮询频率：
                    // - 未 Hover (待机模式): 降低到 100ms (10Hz)，极低功耗，足以捕获鼠标进入
                    // - Hover 中 (交互模式): 提高到 16ms (~60Hz)，确保按钮响应极致丝滑
                    let sleep_duration = if was_hovered {
                        std::time::Duration::from_millis(16)
                    } else {
                        std::time::Duration::from_millis(100)
                    };
                    std::thread::sleep(sleep_duration);
                    
                    // 获取必要参数
                    let mouse_ret = win_clone.cursor_position();
                    let win_pos_ret = win_clone.outer_position();
                    let win_size_ret = win_clone.inner_size();
                    
                    let (is_hovered, rel_x, rel_y) = if let (Ok(mouse), Ok(win_pos), Ok(size)) = (mouse_ret, win_pos_ret, win_size_ret) {
                        let rel_x = mouse.x - win_pos.x as f64;
                        let rel_y = mouse.y - win_pos.y as f64;
                        
                        let hovered = rel_x >= 0.0 && rel_x <= size.width as f64 &&
                                    rel_y >= 0.0 && rel_y <= size.height as f64;
                        (hovered, rel_x, rel_y)
                    } else {
                        (false, 0.0, 0.0)
                    };
                    
                    if is_hovered != was_hovered {
                        let _ = win_clone.emit("hover-change", is_hovered);
                        was_hovered = is_hovered;
                    }

                    // 如果在窗口内，持续发送坐标用于前端模拟 Hover
                    if is_hovered {
                        let _ = win_clone.emit("mouse-pos", MousePosPayload { x: rel_x, y: rel_y });
                    }
                }
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
