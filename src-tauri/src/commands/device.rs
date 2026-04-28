use std::io::ErrorKind;
use std::process::Command;

#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{ERROR_BUFFER_OVERFLOW, ERROR_SUCCESS};
#[cfg(target_os = "windows")]
use windows_sys::Win32::NetworkManagement::IpHelper::{
    GetAdaptersAddresses, GAA_FLAG_SKIP_ANYCAST, GAA_FLAG_SKIP_DNS_SERVER,
    GAA_FLAG_SKIP_MULTICAST, IP_ADAPTER_ADDRESSES_LH, IF_TYPE_SOFTWARE_LOOPBACK,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::NetworkManagement::Ndis::IfOperStatusUp;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Networking::WinSock::AF_UNSPEC;

#[cfg(all(unix, not(target_os = "macos")))]
use std::fs;

#[tauri::command]
pub async fn get_device_mac_address() -> Result<String, String> {
    resolve_device_mac_address()
}

fn resolve_device_mac_address() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        if let Some(mac) = read_windows_mac_address()? {
            return Ok(mac);
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(mac) = read_macos_mac_address()? {
            return Ok(mac);
        }
        if let Some(mac) = read_first_mac_from_command("ifconfig", &["-a"])? {
            return Ok(mac);
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(mac) = read_linux_mac_address()? {
            return Ok(mac);
        }
        if let Some(mac) = read_first_mac_from_command("ip", &["link"])? {
            return Ok(mac);
        }
        if let Some(mac) = read_first_mac_from_command("ifconfig", &["-a"])? {
            return Ok(mac);
        }
    }

    Err("未获取到可用的设备 MAC 地址".to_string())
}

#[cfg(target_os = "windows")]
fn read_windows_mac_address() -> Result<Option<String>, String> {
    const INITIAL_BUFFER_SIZE: u32 = 15 * 1024;
    let flags = GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER;
    let mut buffer_len = INITIAL_BUFFER_SIZE;
    let mut buffer = vec![0u8; buffer_len as usize];

    let mut result = unsafe {
        GetAdaptersAddresses(
            AF_UNSPEC as u32,
            flags,
            std::ptr::null_mut(),
            buffer.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH,
            &mut buffer_len,
        )
    };

    if result == ERROR_BUFFER_OVERFLOW {
        buffer.resize(buffer_len as usize, 0);
        result = unsafe {
            GetAdaptersAddresses(
                AF_UNSPEC as u32,
                flags,
                std::ptr::null_mut(),
                buffer.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH,
                &mut buffer_len,
            )
        };
    }

    if result != ERROR_SUCCESS {
        return Err(format!("读取 Windows 网卡地址失败: {result}"));
    }

    let mut virtual_candidate: Option<String> = None;
    let mut adapter = buffer.as_ptr() as *const IP_ADAPTER_ADDRESSES_LH;

    while !adapter.is_null() {
        let current = unsafe { &*adapter };
        let physical_len = current.PhysicalAddressLength as usize;

        if physical_len == 6 && current.IfType != IF_TYPE_SOFTWARE_LOOPBACK {
            let mac = current.PhysicalAddress[..physical_len]
                .iter()
                .map(|byte| format!("{:02X}", byte))
                .collect::<Vec<_>>()
                .join(":");

            if normalize_mac_address(&mac).is_some() {
                if current.OperStatus == IfOperStatusUp {
                    return Ok(Some(mac));
                }

                if virtual_candidate.is_none() {
                    virtual_candidate = Some(mac);
                }
            }
        }

        adapter = current.Next as *const IP_ADAPTER_ADDRESSES_LH;
    }

    Ok(virtual_candidate)
}

#[cfg(target_os = "macos")]
fn read_macos_mac_address() -> Result<Option<String>, String> {
    let output = run_command("networksetup", &["-listallhardwareports"])?;
    for line in output.lines() {
        if let Some((_, value)) = line.split_once("Ethernet Address:") {
            if let Some(mac) = normalize_mac_address(value) {
                return Ok(Some(mac));
            }
        }
    }
    Ok(None)
}

#[cfg(all(unix, not(target_os = "macos")))]
fn read_linux_mac_address() -> Result<Option<String>, String> {
    let entries = fs::read_dir("/sys/class/net").map_err(|error| error.to_string())?;
    let mut virtual_candidate: Option<String> = None;

    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let interface_name = entry.file_name().to_string_lossy().to_string();
        if interface_name == "lo" {
            continue;
        }

        let interface_path = entry.path();
        let raw_address = match fs::read_to_string(interface_path.join("address")) {
            Ok(value) => value,
            Err(_) => continue,
        };

        let Some(mac) = normalize_mac_address(&raw_address) else {
            continue;
        };

        let is_virtual = fs::canonicalize(&interface_path)
            .ok()
            .map(|path| path.to_string_lossy().contains("/virtual/"))
            .unwrap_or(false);

        if !is_virtual {
            return Ok(Some(mac));
        }

        if virtual_candidate.is_none() {
            virtual_candidate = Some(mac);
        }
    }

    Ok(virtual_candidate)
}

fn read_first_mac_from_command(binary: &str, args: &[&str]) -> Result<Option<String>, String> {
    let output = match run_command(binary, args) {
        Ok(stdout) => stdout,
        Err(error) if error.starts_with("__COMMAND_NOT_FOUND__:") => return Ok(None),
        Err(error) => return Err(error),
    };

    Ok(extract_first_mac_address(&output))
}

fn run_command(binary: &str, args: &[&str]) -> Result<String, String> {
    let mut command = Command::new(binary);
    command.args(args);

    let output = command.output().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            format!("__COMMAND_NOT_FOUND__:{binary}")
        } else {
            format!("执行 {binary} 失败: {error}")
        }
    })?;

    if !output.status.success() {
        return Ok(String::new());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn extract_first_mac_address(output: &str) -> Option<String> {
    output
        .split(|ch: char| {
            ch.is_whitespace() || matches!(ch, ',' | ';' | '"' | '\'' | '(' | ')' | '[' | ']')
        })
        .find_map(normalize_mac_address)
}

fn normalize_mac_address(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let separator = if trimmed.contains(':') {
        ':'
    } else if trimmed.contains('-') {
        '-'
    } else {
        return None;
    };

    let parts = trimmed.split(separator).map(str::trim).collect::<Vec<_>>();

    if parts.len() != 6 {
        return None;
    }

    if parts
        .iter()
        .any(|part| part.len() != 2 || !part.chars().all(|ch| ch.is_ascii_hexdigit()))
    {
        return None;
    }

    let normalized = parts
        .iter()
        .map(|part| part.to_ascii_uppercase())
        .collect::<Vec<_>>()
        .join(":");

    if normalized == "00:00:00:00:00:00" {
        return None;
    }

    Some(normalized)
}

#[cfg(test)]
mod tests {
    use super::normalize_mac_address;

    #[test]
    fn normalizes_hyphenated_mac_addresses() {
        assert_eq!(
            normalize_mac_address("9c-4e-36-aa-bb-cc"),
            Some("9C:4E:36:AA:BB:CC".to_string())
        );
    }

    #[test]
    fn rejects_invalid_mac_addresses() {
        assert_eq!(normalize_mac_address("N/A"), None);
        assert_eq!(normalize_mac_address("00:00:00:00:00:00"), None);
        assert_eq!(normalize_mac_address("9C:4E:36:AA:BB"), None);
    }
}
