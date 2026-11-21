!include "WinVer.nsh"
!include "x64.nsh"
!macro customInit
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "Slate Privacy requiere Windows 10 o posterior (x64)."
    Quit
  ${EndIf}
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "Esta versión de Slate Privacy requiere Windows x64."
    Quit
  ${EndIf}
  ${If} ${IsNativeARM64}
    MessageBox MB_OK|MB_ICONSTOP "Windows ARM no está validado para esta primera versión de Slate Privacy."
    Quit
  ${EndIf}
!macroend
