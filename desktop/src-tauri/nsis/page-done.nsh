; Done page: replaces MUI's Finish page. "Abrir o Lorkarium" runs the app as the user (the
; template's RunMainBinary); "Fechar" just ends the installer. Skipped in passive mode, where the
; updater reopens the app with /R.

!macro LK_PAGE_DONE
  Page custom LkPageDone

  Function LkPageDone
    ${IfThen} $PassiveMode = 1 ${|} Abort ${|}
    !insertmacro LK_PAGE_BEGIN ""
    !insertmacro LK_PX $1 0
    !insertmacro LK_PX $2 34
    !insertmacro LK_LABEL $1 $2 "Tudo pronto." $lkFontTitle ${LK_TEXT}
    !insertmacro LK_PX $1 38
    !insertmacro LK_PX $2 22
    !insertmacro LK_LABEL $1 $2 "Puxa uma cadeira: a mesa tá montada." $lkFontBody ${LK_MUTED}
    Call LkBottomButtonTop
    !insertmacro LK_BUTTON $1 "Abrir o Lorkarium" ${LK_INK} ${LK_GOLD} LkDoneOpenClick
    Call LkDoneCloseLink
    nsDialogs::Show
  FunctionEnd

  ; A quiet text link under the button, for whoever does not want the app open right now.
  Function LkDoneCloseLink
    Call LkBottomButtonTop
    !insertmacro LK_PX $2 50
    IntOp $1 $1 + $2
    !insertmacro LK_PX $2 20
    !insertmacro LK_LABEL $1 $2 "Fechar" $lkFontSmall ${LK_MUTED}
    ${NSD_OnClick} $0 LkDoneCloseClick
  FunctionEnd

  Function LkDoneOpenClick
    Pop $0
    Call RunMainBinary
    SendMessage $HWNDPARENT ${LK_WM_NOTIFY_OUTER_NEXT} 1 0
  FunctionEnd

  Function LkDoneCloseClick
    Pop $0
    SendMessage $HWNDPARENT ${LK_WM_NOTIFY_OUTER_NEXT} 1 0
  FunctionEnd
!macroend
