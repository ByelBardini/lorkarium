; Uninstaller pages: a dark confirmation (with the template's "delete app data" choice, which
; Section Uninstall reads from $DeleteAppDataCheckboxState), the dark progress bar and a goodbye.
; Replaces MUI's confirm page. Every function carries "un.", as NSIS requires in the uninstaller.

!macro LK_UNPAGE_CONFIRM
  !insertmacro LK_CHROME_FUNCTIONS "un."
  !define MUI_CUSTOMFUNCTION_UNGUIINIT un.LkGuiInit
  UninstPage custom un.LkPageConfirm un.LkPageConfirmLeave

  Function un.LkPageConfirm
    ${IfThen} $PassiveMode = 1 ${|} Abort ${|}
    !insertmacro LK_PAGE_BEGIN "un."
    !insertmacro LK_PX $1 0
    !insertmacro LK_PX $2 34
    !insertmacro LK_LABEL $1 $2 "Desinstalar o Lorkarium?" $lkFontTitle ${LK_TEXT}
    !insertmacro LK_PX $1 38
    !insertmacro LK_PX $2 22
    !insertmacro LK_LABEL $1 $2 "Suas mesas continuam salvas no servidor." $lkFontBody ${LK_MUTED}
    Call un.LkBottomRowsTop
    StrCpy $3 "Apagar também os dados deste computador"
    StrCpy $4 300
    Call un.LkCheckRow
    Call un.LkBottomButtonTop
    !insertmacro LK_BUTTON $1 "Desinstalar" ${LK_INK} ${LK_EMBER} un.LkConfirmClick
    Call un.LkCancelLink
    nsDialogs::Show
  FunctionEnd

  ; A quiet text link under the button, like "Fechar" on the installer's done page.
  Function un.LkCancelLink
    Call un.LkBottomButtonTop
    !insertmacro LK_PX $2 50
    IntOp $1 $1 + $2
    !insertmacro LK_PX $2 20
    !insertmacro LK_LABEL $1 $2 "Cancelar" $lkFontSmall ${LK_MUTED}
    ${NSD_OnClick} $0 un.LkQuitClick
  FunctionEnd

  Function un.LkConfirmClick
    Pop $0
    SendMessage $HWNDPARENT ${LK_WM_NOTIFY_OUTER_NEXT} 1 0
  FunctionEnd

  Function un.LkQuitClick
    Pop $0
    Quit
  FunctionEnd

  Function un.LkPageConfirmLeave
    ${NSD_GetState} $lkCheckBox $DeleteAppDataCheckboxState
  FunctionEnd
!macroend

!macro LK_STYLE_UNINSTFILES
  InstProgressFlags smooth
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.LkInstFilesShow

  Function un.LkInstFilesShow
    Call un.LkStyleInstFiles
    StrCpy $3 "Desinstalando o Lorkarium…"
    Call un.LkStatusLine
  FunctionEnd
!macroend

!macro LK_UNPAGE_DONE
  UninstPage custom un.LkPageDone

  Function un.LkPageDone
    ${IfThen} $PassiveMode = 1 ${|} Abort ${|}
    !insertmacro LK_PAGE_BEGIN "un."
    !insertmacro LK_PX $1 0
    !insertmacro LK_PX $2 34
    !insertmacro LK_LABEL $1 $2 "O Lorkarium foi desinstalado." $lkFontTitle ${LK_TEXT}
    !insertmacro LK_PX $1 38
    !insertmacro LK_PX $2 22
    !insertmacro LK_LABEL $1 $2 "Volte quando quiser: a mesa continua montada." $lkFontBody ${LK_MUTED}
    Call un.LkBottomButtonTop
    !insertmacro LK_BUTTON $1 "Fechar" ${LK_INK} ${LK_GOLD} un.LkConfirmClick
    nsDialogs::Show
  FunctionEnd
!macroend
