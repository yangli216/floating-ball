use serde::Deserialize;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum MainWindowRegionMode {
    Full,
    Ball,
    BallMenu,
}

#[cfg(any(test, all(windows, feature = "win7-legacy")))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct RegionRect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

#[cfg(any(test, all(windows, feature = "win7-legacy")))]
const BALL_REGION: RegionRect = RegionRect {
    left: 52,
    top: 52,
    right: 108,
    bottom: 108,
};

#[cfg(any(test, all(windows, feature = "win7-legacy")))]
const BALL_REGIONS: [RegionRect; 1] = [BALL_REGION];

#[cfg(any(test, all(windows, feature = "win7-legacy")))]
const BALL_MENU_REGIONS: [RegionRect; 5] = [
    BALL_REGION,
    RegionRect {
        left: 58,
        top: 4,
        right: 98,
        bottom: 44,
    },
    RegionRect {
        left: 116,
        top: 63,
        right: 156,
        bottom: 103,
    },
    RegionRect {
        left: 58,
        top: 116,
        right: 98,
        bottom: 156,
    },
    RegionRect {
        left: 4,
        top: 63,
        right: 44,
        bottom: 103,
    },
];

#[cfg(any(test, all(windows, feature = "win7-legacy")))]
fn logical_regions(mode: MainWindowRegionMode) -> &'static [RegionRect] {
    match mode {
        MainWindowRegionMode::Full => &[],
        MainWindowRegionMode::Ball => &BALL_REGIONS,
        MainWindowRegionMode::BallMenu => &BALL_MENU_REGIONS,
    }
}

#[cfg(all(windows, feature = "win7-legacy"))]
fn apply_native_region(
    window: &tauri::WebviewWindow,
    mode: MainWindowRegionMode,
) -> Result<(), String> {
    use std::ptr::null_mut;
    use windows_sys::Win32::Graphics::Gdi::{
        CombineRgn, CreateEllipticRgn, CreateRectRgn, DeleteObject, SetWindowRgn, ERROR, RGN_OR,
    };

    let hwnd = window.hwnd().map_err(|error| error.to_string())?.0;
    if mode == MainWindowRegionMode::Full {
        let result = unsafe { SetWindowRgn(hwnd, null_mut(), 1) };
        return if result == 0 {
            Err("SetWindowRgn failed while restoring the full window region".to_string())
        } else {
            Ok(())
        };
    }

    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    let scale_start = |value: i32| (f64::from(value) * scale).floor() as i32;
    let scale_end = |value: i32| (f64::from(value) * scale).ceil() as i32;

    unsafe {
        let combined = CreateRectRgn(0, 0, 0, 0);
        if combined.is_null() {
            return Err("CreateRectRgn failed for the Win7 window region".to_string());
        }

        for rect in logical_regions(mode) {
            let ellipse = CreateEllipticRgn(
                scale_start(rect.left),
                scale_start(rect.top),
                scale_end(rect.right),
                scale_end(rect.bottom),
            );
            if ellipse.is_null() {
                let _ = DeleteObject(combined);
                return Err("CreateEllipticRgn failed for the Win7 window region".to_string());
            }

            let combine_result = CombineRgn(combined, combined, ellipse, RGN_OR);
            let _ = DeleteObject(ellipse);
            if combine_result == ERROR {
                let _ = DeleteObject(combined);
                return Err("CombineRgn failed for the Win7 window region".to_string());
            }
        }

        if SetWindowRgn(hwnd, combined, 1) == 0 {
            let _ = DeleteObject(combined);
            return Err("SetWindowRgn failed for the Win7 window region".to_string());
        }
        // SetWindowRgn owns the region after success; deleting it here would invalidate the window.
    }

    Ok(())
}

#[cfg(not(all(windows, feature = "win7-legacy")))]
fn apply_native_region(
    _window: &tauri::WebviewWindow,
    _mode: MainWindowRegionMode,
) -> Result<(), String> {
    Ok(())
}

pub fn apply_initial_ball_region(window: &tauri::WebviewWindow) -> Result<(), String> {
    apply_native_region(window, MainWindowRegionMode::Ball)
}

#[tauri::command]
pub fn set_main_window_region(
    window: tauri::WebviewWindow,
    mode: MainWindowRegionMode,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("window region updates are restricted to the main window".to_string());
    }
    apply_native_region(&window, mode)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ball_region_matches_the_centered_opaque_ball() {
        assert_eq!(logical_regions(MainWindowRegionMode::Ball), &[BALL_REGION]);
        assert_eq!(BALL_REGION.right - BALL_REGION.left, 56);
        assert_eq!(BALL_REGION.bottom - BALL_REGION.top, 56);
    }

    #[test]
    fn menu_region_contains_center_and_four_menu_buttons() {
        let regions = logical_regions(MainWindowRegionMode::BallMenu);
        assert_eq!(regions.len(), 5);
        assert_eq!(regions[0], BALL_REGION);
        for region in &regions[1..] {
            assert_eq!(region.right - region.left, 40);
            assert_eq!(region.bottom - region.top, 40);
        }
    }

    #[test]
    fn full_region_is_represented_by_no_clipping_shapes() {
        assert!(logical_regions(MainWindowRegionMode::Full).is_empty());
    }
}
