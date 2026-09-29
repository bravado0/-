Attribute VB_Name = "PLConverter"
Option Explicit
'==============================================================
' 손익 양식 변환 매크로 (수식 유지 방식)
'  - 양식(완성본)을 복사해서
'    1) 외부 연결을 이번 LAW DATA / 계정별 원장 / 재공품 파일로 바꿔 끼우고
'    2) LAW DATA를 읽는 SUMPRODUCT 수식의 행 범위를 이번 원본의 구간에 맞게 고친다
'  - 결과 파일은 손으로 만든 것과 똑같이 수식이 살아 있다.
'  - 실행: ConvertPL
'==============================================================

' 원본 구간 제목
Private Const HEADER_LIST As String = "제품|총원가|영업원가|매출원가|직접비|자재비|원자재비|구입자재비|부자재비|노무비|직접경비|생산간접비|영업비|원가비용|영업이익|공헌이익|매출이익"
Private Const TOP_ROW As Long = 5

Private rN() As String, rC() As Double, rE() As Double, rRow() As Long
Private rSec() As String, rHead() As Boolean, rCount As Long, rLast As Long

Public Sub ConvertPL()
    Dim tplPath As Variant, raws As Variant, ledgerPath As Variant
    Dim report As String, i As Long

    tplPath = GetTemplatePath()
    If VarType(tplPath) <> vbString Then Exit Sub

    MsgBox "[2단계] 이번 달 LAW DATA를 고르세요." & vbLf & vbLf & _
        "예: FF24092(프로젝트).xlsx  (Ctrl로 여러 개 선택 가능)", vbInformation, "2/3 LAW DATA"
    raws = Application.GetOpenFilename("Excel 파일 (*.xlsx;*.xls;*.xlsm),*.xlsx;*.xls;*.xlsm", , _
        "2/3 프로젝트 원가 파일 선택 (Ctrl로 여러 개 선택 가능)", , True)
    If Not IsArray(raws) Then Exit Sub

    MsgBox "[3단계] 이번 달 계정별 원장 파일을 고르세요." & vbLf & vbLf & _
        "없으면 다음 창에서 [취소] → 매출 실적 수식은 양식에 있던 원장을 그대로 봅니다.", vbInformation, "3/3 계정별 원장"
    ledgerPath = Application.GetOpenFilename("Excel 파일 (*.xlsx;*.xls;*.xlsm),*.xlsx;*.xls;*.xlsm", , _
        "3/3 계정별 원장 파일 선택 (없으면 취소)")

    Application.ScreenUpdating = False
    Application.DisplayAlerts = False
    Application.AskToUpdateLinks = False
    For i = LBound(raws) To UBound(raws)
        report = report & ConvertOne(CStr(tplPath), CStr(raws(i)), ledgerPath) & vbLf & vbLf
    Next i
    Application.AskToUpdateLinks = True
    Application.DisplayAlerts = True
    Application.ScreenUpdating = True
    MsgBox report, vbInformation, "손익 양식 변환 결과"
End Sub

' 양식 파일 경로: 이 매크로 파일 첫 시트 B1에 기억해 두고 다음부터 그대로 쓴다.
Private Function GetTemplatePath() As Variant
    Dim saved As String, p As Variant
    saved = CStr(ThisWorkbook.Worksheets(1).Range("B1").Value)
    If saved <> "" And IsTemplateFile(saved) Then
        If MsgBox("[1단계] 양식(완성본) 파일:" & vbLf & saved & vbLf & vbLf & _
            "이 양식을 그대로 쓸까요? (아니오 = 다시 고르기)", vbYesNo + vbQuestion, "1/3 양식") = vbYes Then
            GetTemplatePath = saved
            Exit Function
        End If
    End If
    Do
        MsgBox "[1단계] 양식(완성본) 파일을 고르세요." & vbLf & vbLf & _
            "· 계획 / 실적 / 차이 표가 있는 파일  (예: 8월\FF24092.xlsx)" & vbLf & _
            "· 이름에 (프로젝트)가 붙은 LAW DATA 파일은 아닙니다" & vbLf & _
            "· 한 번 고르면 다음부터는 기억합니다", vbInformation, "1/3 양식"
        p = Application.GetOpenFilename("Excel 파일 (*.xlsx;*.xlsm),*.xlsx;*.xlsm", , "1/3 양식(완성본) 파일 선택")
        If VarType(p) <> vbString Then Exit Function
        If IsTemplateFile(CStr(p)) Then Exit Do
        If MsgBox("이 파일은 양식(완성본)이 아닙니다." & vbLf & p & vbLf & vbLf & _
            "LAW DATA(프로젝트) 파일이거나, 외부 연결 수식이 없는 파일입니다." & vbLf & _
            "다시 고를까요?", vbRetryCancel + vbExclamation, "1/3 양식") = vbCancel Then Exit Function
    Loop
    With ThisWorkbook.Worksheets(1)
        .Range("A1").Value = "양식 파일"
        .Range("B1").Value = p
    End With
    On Error Resume Next
    ThisWorkbook.Save
    On Error GoTo 0
    GetTemplatePath = p
End Function

' 양식(완성본)인지 확인: LAW DATA(A1=공종명)가 아니고, 외부 연결 수식이 있어야 한다
Private Function IsTemplateFile(ByVal path As String) As Boolean
    Dim wb As Workbook, c As Range, wasOpen As Boolean
    If Dir(path) = "" Then Exit Function
    On Error Resume Next
    Set wb = Workbooks(Mid(path, InStrRev(path, "\") + 1))
    On Error GoTo Bad
    wasOpen = Not wb Is Nothing
    Application.AskToUpdateLinks = False
    If Not wasOpen Then Set wb = Workbooks.Open(path, 0, True)
    Application.AskToUpdateLinks = True
    If Norm(wb.Worksheets(1).Range("A1").Value) <> Norm("공종명") Then
        For Each c In wb.Worksheets(1).UsedRange
            If c.HasFormula Then
                If InStr(c.Formula, "[") > 0 Then IsTemplateFile = True: Exit For
            End If
        Next c
    End If
Bad:
    Application.AskToUpdateLinks = True
    If Not wasOpen And Not wb Is Nothing Then wb.Close False
End Function

Private Function ConvertOne(ByVal tplPath As String, ByVal rawPath As String, ByVal ledgerPath As Variant) As String
    Dim rawWb As Workbook, outWb As Workbook, rs As Worksheet, ws As Worksheet
    Dim project As String, folder As String, outDir As String, outPath As String
    Dim links As Variant, j As Long, lk As String, newWip As String, notes As String, n As Long

    On Error GoTo Fail
    If LCase(tplPath) = LCase(rawPath) Then Err.Raise vbObjectError + 4, , "양식 파일과 LAW DATA 파일이 같습니다"
    Set rawWb = Workbooks.Open(rawPath, 0, True)
    Set rs = rawWb.Worksheets(1)
    If Norm(rs.Range("A1").Value) <> Norm("공종명") Then Err.Raise vbObjectError + 1, , "LAW DATA 파일이 아닙니다 (A1이 '공종명'이 아님)"
    project = Trim(CStr(rs.Range("B2").Value))
    If project = "" Then Err.Raise vbObjectError + 2, , "B2에 프로젝트 번호가 없습니다"
    LoadRaw rs
    folder = Left(rawPath, InStrRev(rawPath, "\"))

    Set outWb = Workbooks.Open(tplPath, 0, True)
    If outWb Is Nothing Then Err.Raise vbObjectError + 5, , "양식 파일을 열지 못했습니다"
    Set ws = outWb.Worksheets(1)
    If Norm(ws.Range("A1").Value) = Norm("공종명") Then Err.Raise vbObjectError + 4, , "양식 자리에 LAW DATA 파일을 골랐습니다"

    ' 1) 외부 연결 바꿔 끼우기
    links = outWb.LinkSources(xlExcelLinks)
    If Not IsEmpty(links) Then
        For j = LBound(links) To UBound(links)
            lk = CStr(links(j))
            If InStr(FileOf(lk), "(프로젝트)") > 0 Then
                SwapLink outWb, lk, rawPath, notes, "LAW DATA"
            ElseIf InStr(FileOf(lk), "원장") > 0 Then
                If VarType(ledgerPath) = vbString Then
                    SwapLink outWb, lk, CStr(ledgerPath), notes, "계정별 원장"
                Else
                    notes = notes & vbLf & "   ※ 계정별 원장은 양식에 있던 파일 그대로: " & FileOf(lk)
                End If
            ElseIf InStr(FileOf(lk), "(재공품)") > 0 Then
                newWip = FindWip(lk, project, folder)
                If newWip <> "" Then
                    SwapLink outWb, lk, newWip, notes, "재공품"
                Else
                    notes = notes & vbLf & "   ※ " & project & "(재공품).xlsx 를 못 찾아 양식에 있던 파일 그대로: " & lk
                End If
            End If
        Next j
    End If

    ' 2) LAW DATA를 읽는 수식의 행 범위를 이번 원본에 맞게 다시 쓰기
    n = RewriteRawFormulas(ws, rawWb, rs)
    ws.Range("D4").Value = project
    Application.CalculateFull

    outDir = folder & "변환결과\"
    If Dir(outDir, vbDirectory) = "" Then MkDir outDir
    outPath = outDir & project & ".xlsx"
    If LCase(outPath) = LCase(tplPath) Then outPath = outDir & project & "_새.xlsx"
    outWb.SaveAs outPath, 51

    ConvertOne = project & " → 저장: " & outPath & vbLf & "   수식 " & n & "개 범위 맞춤 / " & CheckLine(ws) & notes
    GoTo Cleanup
Fail:
    ConvertOne = FileOf(rawPath) & " → 실패: " & Err.Description
    Resume Cleanup
Cleanup:
    On Error Resume Next
    If Not outWb Is Nothing Then outWb.Close False
    If Not rawWb Is Nothing Then rawWb.Close False
End Function

Private Sub SwapLink(wb As Workbook, ByVal oldLink As String, ByVal newPath As String, ByRef notes As String, ByVal what As String)
    If LCase(oldLink) = LCase(newPath) Then Exit Sub
    On Error Resume Next
    wb.ChangeLink oldLink, newPath, xlLinkTypeExcelLinks
    If Err.Number <> 0 Then notes = notes & vbLf & "   !! " & what & " 연결 바꾸기 실패: " & Err.Description
    On Error GoTo 0
End Sub

' 재공품 파일 찾기: ① LAW DATA와 같은 폴더 ② 양식에 연결돼 있던 재공품 폴더
Private Function FindWip(ByVal oldLink As String, ByVal project As String, ByVal rawFolder As String) As String
    Dim p As String
    p = rawFolder & project & "(재공품).xlsx"
    If Dir(p) <> "" Then FindWip = p: Exit Function
    p = Left(oldLink, InStrRev(oldLink, "\")) & project & "(재공품).xlsx"
    If Dir(p) <> "" Then FindWip = p
End Function

' LAW DATA를 참조하는 SUMPRODUCT 수식을 다시 만든다.
'  - 하위 항목(예: MOTOR): 윗단계 구간(구입자재비)의 항목 행 범위만 본다
'  - 구간 제목(예: 원자재비, 노무비): 이름이 원본에 한 번만 있으면 전체 범위, 여러 번이면 제목 행 하나만
'  - 같은 칸 수식에 "Outlet Damper" 같은 추가 항목이 있으면 같은 범위로 더한다
Private Function RewriteRawFormulas(ws As Worksheet, rawWb As Workbook, rs As Worksheet) As Long
    Dim c As Range, f As String, ref As String, col As String
    Dim lvl As Long, lbl As String, parent As String, s As Long, e As Long
    Dim parts() As String, j As Long, nf As String, n As Long

    ref = "'[" & rawWb.Name & "]" & rs.Name & "'!"
    For Each c In ws.UsedRange
        If c.HasFormula Then
            f = c.Formula
            If InStr(f, "SUMPRODUCT(") > 0 And InStr(f, rawWb.Name) > 0 And c.Row >= TOP_ROW Then
                If InStr(f, "!$E$") > 0 Then col = "E" Else col = "C"
                lbl = RowLabel(ws, c.Row, lvl)
                If lvl > 0 Then
                    parent = ParentLabel(ws, c.Row, lvl)
                    RangeFor lbl, parent, s, e
                    nf = "=" & Term(ref, s, e, ws.Cells(c.Row, lvl).Address(False, False), col)
                    parts = Split(f, Chr(34))
                    For j = 1 To UBound(parts) Step 2
                        nf = nf & "+" & Term(ref, s, e, Chr(34) & parts(j) & Chr(34), col)
                    Next j
                    If nf <> f Then c.Formula = nf
                    n = n + 1
                End If
            End If
        End If
    Next c
    RewriteRawFormulas = n
End Function

Private Function Term(ByVal ref As String, ByVal s As Long, ByVal e As Long, ByVal key As String, ByVal col As String) As String
    Term = "SUMPRODUCT((" & ref & "$A$" & s & ":$A$" & e & "=" & key & ")*(" & _
        ref & "$" & col & "$" & s & ":$" & col & "$" & e & "))/1000"
End Function

Private Sub RangeFor(ByVal lbl As String, ByVal parent As String, ByRef s As Long, ByRef e As Long)
    Dim k As String, p As String, i As Long, cnt As Long
    k = Norm(lbl): p = Norm(parent)
    s = 2: e = rLast
    If IsHeader(k) Then
        For i = 1 To rCount
            If rN(i) = k Then cnt = cnt + 1
        Next i
        If cnt > 1 Then
            For i = 1 To rCount
                If rHead(i) And rN(i) = k Then s = rRow(i): e = rRow(i): Exit Sub
            Next i
        End If
        Exit Sub
    End If
    If p = "" Or Not IsHeader(p) Then Exit Sub
    s = 0
    For i = 1 To rCount
        If rSec(i) = p And Not rHead(i) Then
            If s = 0 Then s = rRow(i)
            e = rRow(i)
        End If
    Next i
    If s = 0 Then s = 2: e = rLast
End Sub

' 원본 합계와 맞는지 확인
Private Function CheckLine(ws As Worksheet) As String
    Dim ok As Boolean
    ok = Near(ws.Range("E6").Value, RawValue("자재비", False) / 1000) _
        And Near(ws.Range("F6").Value, RawValue("자재비", True) / 1000) _
        And Near(ws.Range("E92").Value, RawValue("매출원가", False) / 1000) _
        And Near(ws.Range("F92").Value, RawValue("매출원가", True) / 1000)
    If ok Then CheckLine = "검증 OK (자재비·매출원가가 원본 합계와 일치)" _
    Else CheckLine = "!! 확인 필요: 자재비 또는 매출원가가 원본 합계와 다릅니다"
End Function

Private Function Near(a As Variant, b As Double) As Boolean
    If IsError(a) Then Exit Function
    If Not IsNumeric(a) Then Exit Function
    Near = Abs(CDbl(a) - b) < 0.0015
End Function

Private Function RowLabel(ws As Worksheet, ByVal r As Long, ByRef lvl As Long) As String
    Dim col As Long, v As Variant
    lvl = 0
    For col = 2 To 4
        v = ws.Cells(r, col).Value
        If Not ws.Cells(r, col).HasFormula And VarType(v) = vbString Then
            If Trim(v) <> "" Then RowLabel = v: lvl = col: Exit Function
        End If
    Next col
End Function

Private Function ParentLabel(ws As Worksheet, ByVal r As Long, ByVal lvl As Long) As String
    Dim rr As Long, l2 As Long, t As String
    If lvl <= 2 Then Exit Function
    For rr = r - 1 To TOP_ROW Step -1
        t = RowLabel(ws, rr, l2)
        If l2 = lvl - 1 Then ParentLabel = t: Exit Function
        If l2 > 0 And l2 < lvl - 1 Then Exit Function
    Next rr
End Function

'---------------- 원본 읽기 ----------------
Private Sub LoadRaw(rs As Worksheet)
    Dim data As Variant, r As Long, nm As String, cur As String
    rLast = rs.Cells(rs.Rows.Count, 1).End(xlUp).Row
    data = rs.Range("A1:E" & rLast).Value
    rCount = 0
    ReDim rN(1 To rLast): ReDim rC(1 To rLast): ReDim rE(1 To rLast): ReDim rRow(1 To rLast)
    ReDim rSec(1 To rLast): ReDim rHead(1 To rLast)
    For r = 2 To rLast
        nm = Norm(data(r, 1))
        If nm <> "" Then
            rCount = rCount + 1
            rN(rCount) = nm
            rRow(rCount) = r
            rC(rCount) = ToNum(data(r, 3))
            rE(rCount) = ToNum(data(r, 5))
            ' 제목과 같은 이름의 하위 항목(부자재비 > 부자재비)은 항목으로 본다
            If IsHeader(nm) And nm <> cur Then
                rHead(rCount) = True: cur = nm
            Else
                rHead(rCount) = False
            End If
            rSec(rCount) = cur
        End If
    Next r
End Sub

Private Function RawValue(ByVal key As String, ByVal useActual As Boolean) As Double
    Dim k As String, i As Long
    k = Norm(key)
    For i = 1 To rCount
        If rHead(i) And rN(i) = k Then RawValue = IIf(useActual, rE(i), rC(i)): Exit Function
    Next i
End Function

'---------------- 도구 ----------------
Private Function FileOf(ByVal path As String) As String
    FileOf = Mid(path, InStrRev(path, "\") + 1)
End Function

Private Function IsHeader(ByVal nm As String) As Boolean
    Dim h As Variant
    For Each h In Split(HEADER_LIST, "|")
        If Norm(h) = nm Then IsHeader = True: Exit Function
    Next h
End Function

Private Function Norm(ByVal v As Variant) As String
    If IsError(v) Or IsEmpty(v) Then Exit Function
    Norm = LCase(Application.WorksheetFunction.Trim(Replace(CStr(v), Chr(160), " ")))
End Function

Private Function ToNum(ByVal v As Variant) As Double
    Dim s As String, neg As Boolean
    If IsError(v) Or IsEmpty(v) Then Exit Function
    If IsNumeric(v) And VarType(v) <> vbString Then ToNum = CDbl(v): Exit Function
    s = Replace(Replace(Trim(CStr(v)), ",", ""), " ", "")
    If Left(s, 1) = "(" And Right(s, 1) = ")" Then neg = True: s = Mid(s, 2, Len(s) - 2)
    If s = "" Or s = "-" Or Not IsNumeric(s) Then Exit Function
    ToNum = Val(s)
    If neg Then ToNum = -ToNum
End Function
