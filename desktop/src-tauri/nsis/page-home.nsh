; One-click home page: the logo (outer window), a tagline, what this installer will do to the
; installed version, the desktop shortcut box and one button. Replaces Welcome, Reinstall, Directory.

Var lkInstalledVersion
; SemverCompare of this installer against the installed one: "1" newer, "0" same, "-1" older, "" none.
; Always compared as text: as a number, "" would read as 0 (same version).
Var lkCompare
; 1 when this installer is older than the installed app and the config refuses downgrades.
Var lkDowngradeBlocked

!macro LK_PAGE_HOME
  ; Tauri only has installerIcon, and MUI settles the uninstaller's icon at its first page, so it is
  ; set here, before any: otherwise the uninstaller keeps NSIS's default icon.
  !if "${INSTALLERICON}" != ""
  !ifndef MUI_UNICON
    !define MUI_UNICON "${INSTALLERICON}"
  !endif
  !endif
  !insertmacro LK_CHROME_FUNCTIONS ""
  !define MUI_CUSTOMFUNCTION_GUIINIT LkGuiInit
  Page custom LkPageHome LkPageHomeLeave

  Function LkDetectInstalled
    StrCpy $lkCompare ""
    StrCpy $lkDowngradeBlocked 0
    ReadRegStr $lkInstalledVersion SHCTX "${UNINSTKEY}" "DisplayVersion"
    ${IfThen} $lkInstalledVersion == "" ${|} Return ${|}
    nsis_tauri_utils::SemverCompare "${VERSION}" $lkInstalledVersion
    Pop $lkCompare
    !if "${ALLOWDOWNGRADES}" == "false"
      ${IfThen} $lkCompare == "-1" ${|} StrCpy $lkDowngradeBlocked 1 ${|}
    !endif
  FunctionEnd

  Function LkPageHome
    ${IfThen} $PassiveMode = 1 ${|} Abort ${|}
    Call LkDetectInstalled
    !insertmacro LK_PAGE_BEGIN ""
    !insertmacro LK_PX $1 4
    !insertmacro LK_PX $2 28
    !insertmacro LK_LABEL $1 $2 "Mesa virtual de RPG" $lkFontBody ${LK_TEXT}
    Call LkHomeStatus
    ${If} $lkDowngradeBlocked = 1
      Call LkHomeDowngradeButton
    ${Else}
      Call LkHomeShortcutRow
      Call LkHomeInstallButton
    ${EndIf}
    nsDialogs::Show
  FunctionEnd

  Function LkHomeStatus
    StrCpy $3 "Versão ${VERSION} para Windows"
    ${If} $lkCompare == "1"
      StrCpy $3 "Atualiza a versão $lkInstalledVersion para a ${VERSION}"
    ${ElseIf} $lkCompare == "0"
      StrCpy $3 "A versão ${VERSION} já está instalada"
    ${ElseIf} $lkCompare == "-1"
      StrCpy $3 "A versão $lkInstalledVersion, mais nova, já está instalada"
    ${EndIf}
    !insertmacro LK_PX $1 36
    !insertmacro LK_PX $2 20
    !insertmacro LK_LABEL $1 $2 $3 $lkFontSmall ${LK_MUTED}
  FunctionEnd

  Function LkHomeShortcutRow
    Call LkBottomRowsTop
    StrCpy $3 "Criar atalho na área de trabalho"
    StrCpy $4 220
    Call LkCheckRow
    Call LkDefaultShortcutState
  FunctionEnd

  ; Fresh install: checked. Update: keep whatever the person did with the old shortcut.
  Function LkDefaultShortcutState
    ${If} $lkCompare == ""
    ${OrIf} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
      ${NSD_Check} $lkCheckBox
    ${EndIf}
  FunctionEnd

  Function LkHomeInstallButton
    StrCpy $3 "Instalar"
    ${IfThen} $lkCompare == "1" ${|} StrCpy $3 "Atualizar" ${|}
    ${IfThen} $lkCompare == "0" ${|} StrCpy $3 "Reinstalar" ${|}
    ${IfThen} $lkCompare == "-1" ${|} StrCpy $3 "Instalar mesmo assim" ${|}
    Call LkBottomButtonTop
    !insertmacro LK_BUTTON $1 $3 ${LK_INK} ${LK_GOLD} LkHomeInstallClick
  FunctionEnd

  ; Only with bundle.windows.nsis.allowDowngrades false (Tauri's default is true): closing is the way out.
  Function LkHomeDowngradeButton
    Call LkBottomButtonTop
    !insertmacro LK_BUTTON $1 "Fechar" ${LK_TEXT} ${LK_DISABLED_BG} LkQuitClick
    EnableWindow $mui.Button.Next 0
  FunctionEnd

  Function LkHomeInstallClick
    Pop $0
    SendMessage $HWNDPARENT ${LK_WM_NOTIFY_OUTER_NEXT} 1 0
  FunctionEnd

  Function LkQuitClick
    Pop $0
    Quit
  FunctionEnd

  Function LkPageHomeLeave
    ${IfThen} $lkDowngradeBlocked = 1 ${|} Abort ${|}
    ${NSD_GetState} $lkCheckBox $lkShortcutState
  FunctionEnd
!macroend
