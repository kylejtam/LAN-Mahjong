; LAN Mahjong installer for Windows (built with NSIS).
; Installs for the current user only (no administrator needed):
;   - the game into  %LOCALAPPDATA%\Programs\LAN Mahjong
;   - "LAN Mahjong" icons on the desktop and in the Start menu
;   - "Uninstall LAN Mahjong.exe" (also listed in Windows Settings > Apps)
; Saved games live in %LOCALAPPDATA%\LAN Mahjong and are kept when updating.

Unicode true
!define APPNAME "LAN Mahjong"
!define REGKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\LANMahjong"
!ifndef VERSION
  !define VERSION "1.0.0"
!endif

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\LAN Mahjong"
RequestExecutionLevel user
SetCompressor /SOLID lzma
; A bigger look-back window lets the compressor find more repeats in node.exe (smaller download).
SetCompressorDictSize 64
BrandingText "LAN Mahjong ${VERSION}"

!include "MUI2.nsh"
!include "FileFunc.nsh"
!define MUI_ICON "lan-mahjong.ico"
!define MUI_UNICON "lan-mahjong.ico"
!define MUI_WELCOMEPAGE_TITLE "Install LAN Mahjong"
!define MUI_WELCOMEPAGE_TEXT "This puts LAN Mahjong on this computer, with an icon on your desktop.$\r$\n$\r$\nDouble-click the icon to start the game: a small window opens (keep it open while playing; close it to stop the game) and the host page opens in your browser.$\r$\n$\r$\nYour saved games are kept if you install a newer version."
!define MUI_FINISHPAGE_RUN "$INSTDIR\LAN Mahjong.cmd"
!define MUI_FINISHPAGE_RUN_TEXT "Start LAN Mahjong now"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

; Stop a running copy of the game before replacing or removing its files.
; Only the game's own node.exe (the one inside the install folder) is stopped.
; (Do NOT match on window titles: the installer's own window is called
; "LAN Mahjong Setup", and an earlier version closed itself that way.)
!macro StopRunningGame ID
  ; The installer is a 32-bit program. On 64-bit Windows a plain "powershell"
  ; started from it is the 32-bit one, which cannot see where 64-bit programs
  ; live, so it never found the game. Use the 64-bit one (Sysnative) when there,
  ; and ask Windows' process list (CIM), which works either way.
  StrCpy $1 "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
  IfFileExists "$1" +2
    StrCpy $1 "powershell"
  nsExec::Exec `"$1" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$p = @(Get-CimInstance Win32_Process | Where-Object { $$_.Name -eq 'node.exe' -and $$_.ExecutablePath -like '$INSTDIR\node\node.exe' }); $$p | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }; $$p | ForEach-Object { Wait-Process -Id $$_.ProcessId -Timeout 10 -ErrorAction SilentlyContinue }"`
  Pop $0
  Sleep 1000
  ; Safety net: if the game is somehow still running, ask the person to close it.
  check_${ID}:
    IfFileExists "$INSTDIR\node\node.exe" 0 done_${ID}
    ; A running program's file can't be opened for writing on Windows.
    ClearErrors
    FileOpen $2 "$INSTDIR\node\node.exe" a
    IfErrors 0 free_${ID}
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "LAN Mahjong is still running.$\r$\n$\r$\nPlease close the LAN Mahjong window (the small black window), then click OK." /SD IDCANCEL IDOK check_${ID}
      Abort "LAN Mahjong is still running. Close it and run this again."
    free_${ID}:
    FileClose $2
  done_${ID}:
!macroend

Section "Install"
  !insertmacro StopRunningGame inst
  SetOutPath "$INSTDIR"
  File "lan-mahjong.ico"
  File "LAN Mahjong.cmd"
  SetOutPath "$INSTDIR\node"
  File "${BUILD}/node/node.exe"
  RMDir /r "$INSTDIR\app"
  SetOutPath "$INSTDIR\app"
  File /r "${BUILD}/app/*.*"
  SetOutPath "$INSTDIR"

  CreateDirectory "$SMPROGRAMS\LAN Mahjong"
  CreateShortcut "$SMPROGRAMS\LAN Mahjong\LAN Mahjong.lnk" "$INSTDIR\LAN Mahjong.cmd" "" "$INSTDIR\lan-mahjong.ico"
  CreateShortcut "$SMPROGRAMS\LAN Mahjong\Uninstall LAN Mahjong.lnk" "$INSTDIR\Uninstall LAN Mahjong.exe" "" "$INSTDIR\lan-mahjong.ico"
  CreateShortcut "$DESKTOP\LAN Mahjong.lnk" "$INSTDIR\LAN Mahjong.cmd" "" "$INSTDIR\lan-mahjong.ico"

  WriteUninstaller "$INSTDIR\Uninstall LAN Mahjong.exe"
  WriteRegStr HKCU "${REGKEY}" "DisplayName" "LAN Mahjong"
  WriteRegStr HKCU "${REGKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${REGKEY}" "Publisher" "Kyle"
  WriteRegStr HKCU "${REGKEY}" "DisplayIcon" "$INSTDIR\lan-mahjong.ico"
  WriteRegStr HKCU "${REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${REGKEY}" "UninstallString" '"$INSTDIR\Uninstall LAN Mahjong.exe"'
  WriteRegDWORD HKCU "${REGKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${REGKEY}" "NoRepair" 1

  ; Automatic update (/RELAUNCH): start LAN Mahjong again once the new files are in.
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/RELAUNCH" $R1
  IfErrors +2
    Exec '"$SYSDIR\cmd.exe" /c ""$INSTDIR\LAN Mahjong.cmd""'
SectionEnd

Section "Uninstall"
  !insertmacro StopRunningGame un
  Delete "$DESKTOP\LAN Mahjong.lnk"
  RMDir /r "$SMPROGRAMS\LAN Mahjong"
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\node"
  Delete "$INSTDIR\LAN Mahjong.cmd"
  Delete "$INSTDIR\lan-mahjong.ico"
  Delete "$INSTDIR\Uninstall LAN Mahjong.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${REGKEY}"
  MessageBox MB_YESNO|MB_ICONQUESTION "Also delete your saved games?$\r$\n$\r$\n(Choose No to keep them for next time.)" /SD IDNO IDNO keep
    RMDir /r "$LOCALAPPDATA\LAN Mahjong"
  keep:
SectionEnd
