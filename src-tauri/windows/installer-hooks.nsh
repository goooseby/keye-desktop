; ProductName is now 华工课栈; registry identity remains 课页 in installer.nsi.
; Rename only shortcuts pointing to this exact installation. Do not touch pinned items.
!macro MigrateLegacyShortcut OLD NEW
  Push $R8
  !insertmacro IsShortcutTarget "${OLD}" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $R8
  ${If} $R8 = 1
    ${IfNot} ${FileExists} "${NEW}"
      Rename "${OLD}" "${NEW}"
    ${Else}
      !insertmacro IsShortcutTarget "${NEW}" "$INSTDIR\${MAINBINARYNAME}.exe"
      Pop $R8
      ${If} $R8 = 1
        Delete "${OLD}"
      ${EndIf}
    ${EndIf}
  ${EndIf}
  Pop $R8
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro MigrateLegacyShortcut "$DESKTOP\课页.lnk" "$DESKTOP\华工课栈.lnk"
  !insertmacro MigrateLegacyShortcut "$SMPROGRAMS\课页.lnk" "$SMPROGRAMS\华工课栈.lnk"
  !if "${STARTMENUFOLDER}" != ""
    !insertmacro MigrateLegacyShortcut "$SMPROGRAMS\$AppStartMenuFolder\课页.lnk" "$SMPROGRAMS\$AppStartMenuFolder\华工课栈.lnk"
  !endif
!macroend
