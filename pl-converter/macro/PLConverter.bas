Attribute VB_Name = "PLConverter"
Option Explicit
'==============================================================
' 손익 양식 변환 매크로
'  - 프로젝트 원가 RAW 파일 -> 손익 양식(FF○○○○○.xlsx)
'  - 양식 파일(외부 연결 수식이 들어 있는 원래 완성본)의 수식을 읽어서
'    어느 칸에 무엇을 넣을지 스스로 찾는다.
'  - 실행: ConvertPL
'==============================================================

' 재공품 파일 조회 범위 (양식의 VLOOKUP 범위 $B$2:$Q$14, 12번째 열 = M열)
Private Const WIP_FIRST As Long = 2
Private Const WIP_LAST As Long = 14
Private Const WIP_KEYCOL As Long = 2
Private Const WIP_VALCOL As Long = 13
Private Const TOP_ROW As Long = 5

' 원본 구간 제목
Private Const HEADER_LIST As String = "제품|총원가|영업원가|매출원가|직접비|자재비|원자재비|구입자재비|부자재비|노무비|직접경비|생산간접비|영업비|원가비용|영업이익|공헌이익|매출이익"

Private rN() As String, rC() As Double, rE() As Double
Private rSec() As String, rHead() As Boolean, rCount As Long

Public Sub ConvertPL()
    Dim tplPath As Variant, raws As Variant, ledgerPath As Variant
    Dim ledgerWb As Workbook, report As String, i As Long

    tplPath = GetTemplatePath()
    If VarType(tplPath) <> vbString Then Exit Sub

    MsgBox "[2단계] 이번 달 LAW DATA를 고르세요." & vbLf & vbLf & _
        "예: FF24092(프로젝트).xlsx  (Ctrl로 여러 개 선택 가능)", vbInformation, "2/3 LAW DATA"
    raws = Application.GetOpenFilename("Excel 파일 (*.xlsx;*.xls;*.xlsm),*.xlsx;*.xls;*.xlsm", , _
        "2/3 프로젝트 원가 파일 선택 (Ctrl로 여러 개 선택 가능)", , True)
    If Not IsArray(raws) Then Exit Sub

    MsgBox "[3단계] 계정별 원장 파일을 고르세요." & vbLf & vbLf & _
        "없으면 다음 창에서 [취소] → 매출액 실적은 0으로 들어갑니다.", vbInformation, "3/3 계정별 원장"
    ledgerPath = Application.GetOpenFilename("Excel 파일 (*.xlsx;*.xls;*.xlsm),*.xlsx;*.xls;*.xlsm", , _
        "3/3 계정별 원장 파일 선택 (없으면 취소 → 매출 실적 0)")

    Application.ScreenUpdating = False
    Application.DisplayAlerts = False
    Application.AskToUpdateLinks = False
    On Error GoTo Done
    If VarType(ledgerPath) = vbString Then Set ledgerWb = Workbooks.Open(ledgerPath, 0, True)

    For i = LBound(raws) To UBound(raws)
        report = report & ConvertOne(CStr(tplPath), CStr(raws(i)), ledgerWb) & vbLf
    Next i

Done:
    If Err.Number <> 0 Then report = report & "오류: " & Err.Description & vbLf
    If Not ledgerWb Is Nothing Then ledgerWb.Close False
    Application.AskToUpdateLinks = True
    Application.DisplayAlerts = True
    Application.ScreenUpdating = True
    If ledgerWb Is Nothing Then report = report & vbLf & "※ 계정별 원장 없음 → 매출액 실적 0"
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
            "LAW DATA(프로젝트) 파일이거나, 외부 연결 수식이 없는 결과 파일입니다." & vbLf & _
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

Private Function ConvertOne(ByVal tplPath As String, ByVal rawPath As String, ledgerWb As Workbook) As String
    Dim rawWb As Workbook, wipWb As Workbook, outWb As Workbook
    Dim rs As Worksheet, ws As Worksheet
    Dim project As String, folder As String, outDir As String, outPath As String
    Dim wipPath As String, msg As String, filled As Long

    On Error GoTo Fail
    Set rawWb = Workbooks.Open(rawPath, 0, True)
    Set rs = rawWb.Worksheets(1)
    If Norm(rs.Range("A1").Value) <> Norm("공종명") Then Err.Raise vbObjectError + 1, , "프로젝트 원가 파일이 아닙니다 (A1이 '공종명'이 아님)"
    project = Trim(CStr(rs.Range("B2").Value))
    If project = "" Then Err.Raise vbObjectError + 2, , "B2에 프로젝트 번호가 없습니다"
    LoadRaw rs

    folder = Left(rawPath, InStrRev(rawPath, "\"))
    wipPath = folder & project & "(재공품).xlsx"
    If Dir(wipPath) <> "" Then Set wipWb = Workbooks.Open(wipPath, 0, True)

    If LCase(tplPath) = LCase(rawPath) Then Err.Raise vbObjectError + 4, , _
        "양식 파일로 프로젝트 원가 파일을 골랐습니다. 양식은 계획·실적·차이가 있는 완성본이어야 합니다 (B1 칸을 지우고 다시 실행)"
    Set outWb = Workbooks.Open(tplPath, 0, True)
    If outWb Is Nothing Then Err.Raise vbObjectError + 5, , "양식 파일을 열지 못했습니다: " & tplPath
    Set ws = outWb.Worksheets(1)
    If Norm(ws.Range("A1").Value) = Norm("공종명") Then Err.Raise vbObjectError + 4, , _
        "양식 파일로 프로젝트 원가 파일을 골랐습니다. 양식은 계획·실적·차이가 있는 완성본이어야 합니다 (B1 칸을 지우고 다시 실행)"
    filled = FillSheet(ws, rs, ledgerWb, wipWb, project)
    If filled = 0 Then Err.Raise vbObjectError + 3, , _
        "양식에 외부 연결 수식이 없습니다. 변환 결과 파일 말고, 수식이 들어 있는 원래 양식을 골라 주세요"
    BreakAllLinks outWb
    Application.Calculate

    outDir = folder & "변환결과\"
    If Dir(outDir, vbDirectory) = "" Then MkDir outDir
    outPath = outDir & project & ".xlsx"
    If LCase(outPath) = LCase(tplPath) Then outPath = outDir & project & "_새.xlsx"
    outWb.SaveAs outPath, 51

    msg = project & " → 저장: " & outPath & vbLf & "   " & CheckLine(ws)
    If wipWb Is Nothing Then msg = msg & vbLf & "   ※ " & project & "(재공품).xlsx 없음 → 재공품 비교표 0"
    ConvertOne = msg
    GoTo Cleanup
Fail:
    ConvertOne = Mid(rawPath, InStrRev(rawPath, "\") + 1) & " → 실패: " & Err.Description
    Resume Cleanup
Cleanup:
    On Error Resume Next
    If Not outWb Is Nothing Then outWb.Close False
    If Not wipWb Is Nothing Then wipWb.Close False
    If Not rawWb Is Nothing Then rawWb.Close False
End Function

' 원본 합계와 맞는지 확인
Private Function CheckLine(ws As Worksheet) As String
    Dim ok As Boolean
    ok = Near(ws.Range("E6").Value, RawValue("자재비", "", False) / 1000) _
        And Near(ws.Range("F6").Value, RawValue("자재비", "", True) / 1000) _
        And Near(ws.Range("E92").Value, RawValue("매출원가", "", False) / 1000) _
        And Near(ws.Range("F92").Value, RawValue("매출원가", "", True) / 1000)
    If ok Then CheckLine = "검증 OK (자재비·매출원가가 원본 합계와 일치)" _
    Else CheckLine = "!! 확인 필요: 자재비 또는 매출원가가 원본 합계와 다릅니다"
End Function

Private Function Near(a As Variant, b As Double) As Boolean
    If Not IsNumeric(a) Then Exit Function
    Near = Abs(CDbl(a) - b) < 0.0015
End Function

'---------------- 양식 채우기 ----------------
Private Function FillSheet(ws As Worksheet, rs As Worksheet, ledgerWb As Workbook, wipWb As Workbook, ByVal project As String) As Long
    Dim c As Range, n As Long, i As Long, f As String
    Dim addrs() As String, fmls() As String, extras As Object
    Dim r As Long, col As Long, v As Variant, key As String, parts() As String, j As Long

    ' 1) 외부 연결 수식을 먼저 모두 모아 둔다 (채우는 도중 수식이 사라지므로)
    Set extras = CreateObject("Scripting.Dictionary")
    For Each c In ws.UsedRange
        If c.HasFormula Then
            If InStr(c.Formula, "[") > 0 Then
                n = n + 1
                ReDim Preserve addrs(1 To n): ReDim Preserve fmls(1 To n)
                addrs(n) = c.Address(False, False): fmls(n) = c.Formula
                If InStr(c.Formula, "SUMPRODUCT(") > 0 Then
                    parts = Split(c.Formula, Chr(34))
                    For j = 1 To UBound(parts) Step 2
                        If Not extras.Exists(c.Row & "|" & parts(j)) Then extras.Add c.Row & "|" & parts(j), parts(j)
                    Next j
                End If
            End If
        End If
    Next c
    FillSheet = n
    If n = 0 Then Exit Function

    ' 2) 위쪽 "행 찾기" 보조 칸은 필요 없으므로 비운다
    ws.Range("D1:F3").ClearContents
    ws.Range("D4").Value = project

    ' 3) 칸마다 값 채우기
    For i = 1 To n
        Set c = ws.Range(addrs(i))
        f = fmls(i)
        r = c.Row: col = c.Column
        If r <= 3 And col >= 4 Then
            ' 비운 칸
        ElseIf InStr(f, "계정별 원장") > 0 Then
            If ledgerWb Is Nothing Then v = 0 Else v = LedgerSum(ledgerWb, project) / 1000
            c.Value = Round(v, 6)
        ElseIf InStr(f, "VLOOKUP(") > 0 Then
            v = 0
            If Not wipWb Is Nothing Then
                key = ArgRef(f, "VLOOKUP(")
                If VarType(ws.Range(key).Value) = vbString Then v = WipLookup(wipWb, CStr(ws.Range(key).Value)) / 1000
            End If
            c.Value = Round(v, 6)
        ElseIf InStr(f, "MATCH(") > 0 Then
            v = Empty
            If Not wipWb Is Nothing Then v = WipMatch(wipWb, CStr(ws.Range(ArgRef(f, "MATCH(")).Value))
            c.Value = v
        ElseIf InStr(f, "SUMPRODUCT(") > 0 Then
            c.Value = Round(RowRawValue(ws, r, InStr(f, "!$E$") > 0, extras) / 1000, 6)
        Else
            ' 원본 칸을 그대로 가져오는 수식 (예: =[1]Sheet!$C$2/1000, =+[2]Sheet!A2)
            key = Mid(f, InStrRev(f, "!") + 1)
            If InStr(key, "/1000") > 0 Then
                key = Replace(Replace(key, "/1000", ""), "$", "")
                c.Value = ToNum(rs.Range(key).Value) / 1000
            Else
                c.Value = rs.Range(Replace(key, "$", "")).Value
            End If
        End If
    Next i
End Function

' 한 행의 원본 값: 행 라벨 + (같은 행 수식에 적힌 "추가 항목") 을 윗단계 구간 안에서 찾아 더한다
Private Function RowRawValue(ws As Worksheet, ByVal r As Long, ByVal useActual As Boolean, extras As Object) As Double
    Dim lbl As String, lvl As Long, parent As String, k As Variant, s As Double
    lbl = RowLabel(ws, r, lvl)
    parent = ParentLabel(ws, r, lvl)
    s = RawValue(lbl, parent, useActual)
    For Each k In extras.Keys
        If Split(k, "|")(0) = CStr(r) Then s = s + RawValue(extras(k), parent, useActual)
    Next k
    RowRawValue = s
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
    Dim lastRow As Long, data As Variant, r As Long, nm As String, cur As String
    lastRow = rs.Cells(rs.Rows.Count, 1).End(xlUp).Row
    data = rs.Range("A1:E" & lastRow).Value
    rCount = 0
    ReDim rN(1 To lastRow): ReDim rC(1 To lastRow): ReDim rE(1 To lastRow)
    ReDim rSec(1 To lastRow): ReDim rHead(1 To lastRow)
    For r = 2 To lastRow
        nm = Norm(data(r, 1))
        If nm <> "" Then
            rCount = rCount + 1
            rN(rCount) = nm
            rC(rCount) = ToNum(data(r, 3))
            rE(rCount) = ToNum(data(r, 5))
            ' 제목과 같은 이름의 하위 항목(부자재비 > 부자재비)은 항목으로 본다
            If IsHeader(nm) And nm <> cur Then
                rHead(rCount) = True: cur = nm
            End If
            rSec(rCount) = cur
        End If
    Next r
End Sub

Private Function RawValue(ByVal key As String, ByVal parent As String, ByVal useActual As Boolean) As Double
    Dim k As String, p As String, i As Long, inSec As Boolean, s As Double
    k = Norm(key): p = Norm(parent)
    If IsHeader(k) Then
        For i = 1 To rCount
            If rHead(i) And rN(i) = k Then RawValue = IIf(useActual, rE(i), rC(i)): Exit Function
        Next i
        Exit Function
    End If
    If p <> "" And IsHeader(p) Then
        For i = 1 To rCount
            If rHead(i) And rN(i) = p Then inSec = True: Exit For
        Next i
    End If
    For i = 1 To rCount
        If rN(i) = k And Not rHead(i) Then
            If Not inSec Or rSec(i) = p Then s = s + IIf(useActual, rE(i), rC(i))
        End If
    Next i
    RawValue = s
End Function

'---------------- 원장·재공품 ----------------
Private Function LedgerSum(wb As Workbook, ByVal project As String) As Double
    Dim sh As Worksheet, lastRow As Long, data As Variant, r As Long, s As Double
    On Error Resume Next
    Set sh = wb.Worksheets("계정별 원장")
    On Error GoTo 0
    If sh Is Nothing Then Set sh = wb.Worksheets(1)
    lastRow = sh.Cells(sh.Rows.Count, 4).End(xlUp).Row
    If lastRow < 2 Then Exit Function
    data = sh.Range("A1:K" & lastRow).Value
    For r = 2 To lastRow
        If Norm(data(r, 4)) = Norm(project) Then s = s + ToNum(data(r, 11))
    Next r
    LedgerSum = s
End Function

Private Function WipLookup(wb As Workbook, ByVal key As String) As Double
    Dim sh As Worksheet, r As Long
    Set sh = wb.Worksheets(1)
    For r = WIP_FIRST To WIP_LAST
        If Norm(sh.Cells(r, WIP_KEYCOL).Value) = Norm(key) Then WipLookup = ToNum(sh.Cells(r, WIP_VALCOL).Value): Exit Function
    Next r
End Function

Private Function WipMatch(wb As Workbook, ByVal key As String) As Variant
    Dim sh As Worksheet, r As Long, lastRow As Long
    Set sh = wb.Worksheets(1)
    WipMatch = Empty
    If Trim(key) = "" Then Exit Function
    lastRow = sh.Cells(sh.Rows.Count, WIP_KEYCOL).End(xlUp).Row
    For r = 1 To lastRow
        If Norm(sh.Cells(r, WIP_KEYCOL).Value) = Norm(key) Then WipMatch = r: Exit Function
    Next r
End Function

'---------------- 도구 ----------------
Private Sub BreakAllLinks(wb As Workbook)
    Dim links As Variant, j As Long
    links = wb.LinkSources(xlExcelLinks)
    If IsEmpty(links) Then Exit Sub
    For j = LBound(links) To UBound(links)
        On Error Resume Next
        wb.BreakLink links(j), xlLinkTypeExcelLinks
        On Error GoTo 0
    Next j
End Sub

' 수식에서 함수의 첫 번째 인수(칸 주소)를 꺼낸다. 예: VLOOKUP(D101, ...) -> D101
Private Function ArgRef(ByVal f As String, ByVal fn As String) As String
    Dim s As String
    s = Mid(f, InStr(f, fn) + Len(fn))
    ArgRef = Replace(Left(s, InStr(s, ",") - 1), "$", "")
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
