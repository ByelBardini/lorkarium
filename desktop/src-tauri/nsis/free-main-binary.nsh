; Update mode only. The updater closes the app right after starting this installer, so the
; template's CheckIfAppIsRunning is not needed there, and its RmShutdown waits forever when the
; exe is held by something it cannot close (an antivirus, an elevated or frozen process): a player
; got stuck on "Atualizando o Lorkarium…" and only uninstalling got them out. Here the old exe is
; renamed aside (Windows allows that even while it runs or is open) and the new one goes in its
; place; a rename that still fails asks to try again instead of waiting in silence.

; How long the updater gets to exit on its own before what is left is closed: 25 × 200 ms.
!define LK_EXIT_WAIT_STEPS 25

; A macro, not functions: hooks are included before MAINBINARYNAME and the plugin directory
; (!addplugindir) exist, and this expands inside Section Install, after both.
!macro LK_FREE_MAIN_BINARY
  Push $R8
  Push $R9
  !insertmacro LK_WAIT_APP_EXIT
  ; What earlier updates renamed aside; a file still held stays for the next one.
  Delete "$INSTDIR\${MAINBINARYNAME}.*.old"
  ${If} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro LK_RENAME_OLD_BINARY
  ${EndIf}
  Pop $R9
  Pop $R8
!macroend

!macro LK_WAIT_APP_EXIT
  StrCpy $R8 0
  ${Do}
    ; Not FindProcessCurrentUser: after it, the next MessageBox closes by itself as Cancel.
    nsis_tauri_utils::FindProcess "${MAINBINARYNAME}.exe"
    Pop $R9
    ${IfThen} $R9 <> 0 ${|} ${ExitDo} ${|}
    ${If} $R8 >= ${LK_EXIT_WAIT_STEPS}
      nsis_tauri_utils::KillProcessCurrentUser "${MAINBINARYNAME}.exe"
      Pop $R9
      ${ExitDo}
    ${EndIf}
    Sleep 200
    IntOp $R8 $R8 + 1
  ${Loop}
!macroend

; A unique name per try, since an older .old may still be held. Retry jumps over the Abort.
!macro LK_RENAME_OLD_BINARY
  ${Do}
    System::Call 'kernel32::GetTickCount() i .R8'
    ClearErrors
    Rename "$INSTDIR\${MAINBINARYNAME}.exe" "$INSTDIR\${MAINBINARYNAME}.$R8.old"
    ${IfNotThen} ${Errors} ${|} ${ExitDo} ${|}
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Outro programa está usando o Lorkarium ($INSTDIR\${MAINBINARYNAME}.exe), por isso a atualização não consegue substituí-lo.$\r$\n$\r$\nSe for o antivírus, espere ele terminar a verificação e clique em Repetir." /SD IDCANCEL IDRETRY +2
    Abort "Outro programa está usando $INSTDIR\${MAINBINARYNAME}.exe."
  ${Loop}
!macroend
