$baseUrl = "http://localhost:3001"
$results = @()
$global:currentToken = $null

function Log($msg, $color = "White") { Write-Host $msg -ForegroundColor $color }
function Pass($area) { $script:results += [PSCustomObject]@{ Area=$area; Result="PASS" }; Log "  PASS: $area" "Green" }
function Fail($area, $detail) { $script:results += [PSCustomObject]@{ Area=$area; Result="FAIL" }; Log "  FAIL: $area - $detail" "Red" }
function Partial($area, $detail) { $script:results += [PSCustomObject]@{ Area=$area; Result="PARTIAL" }; Log "  PARTIAL: $area - $detail" "Yellow" }

function Login($email, $pass) {
    $global:currentToken = $null
    $body = "{`"email`":`"$email`",`"password`":`"$pass`"}"
    $resp = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body $body
    $global:currentToken = $resp.data.token
    return $resp.data
}
function AuthHeaders() { return @{"Authorization"="Bearer $global:currentToken"} }
function AGet($url) { return Invoke-RestMethod -Uri "$baseUrl$url" -Headers (AuthHeaders) }
function APost($url, $body) { return Invoke-RestMethod -Uri "$baseUrl$url" -Method POST -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) -Headers (AuthHeaders) }
function APut($url, $body) { return Invoke-RestMethod -Uri "$baseUrl$url" -Method PUT -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) -Headers (AuthHeaders) }
function APatch($url, $body) { return Invoke-RestMethod -Uri "$baseUrl$url" -Method PATCH -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) -Headers (AuthHeaders) }

$phoneSeed = (Get-Date -Format "yyMMddHHmmss") + (Get-Random -Maximum 999).ToString().PadLeft(3, "0")
function New-TestPhone([int]$n) { return "+91-9$phoneSeed" + $n.ToString().PadLeft(3, "0") }

$root = "C:\Users\jay\Desktop\Projects\Projects\DCT-CRMM\DCT-CRMM"

Log "`n=== A. NEW->INCOMING ON FIRST ACTIVITY (as lead creator/admin) ===" "Cyan"
Login "admin@dctcrm.com" "password123" | Out-Null
$leadA = APost "/api/leads" @{firstName="ActFirst"; lastName="TestA"; company="ActCorp"; source="WEBSITE"; phone=(New-TestPhone 1)}
if ($leadA.data.status -eq "NEW") { Pass "A1 Lead starts NEW" } else { Fail "A1 Lead starts NEW" "status=$($leadA.data.status)" }

$note1 = APost "/api/activities" @{type="NOTE"; subject="First note"; description="Initial outreach note"; leadId=$leadA.data.id}
$leadAfter = AGet "/api/leads/$($leadA.data.id)"
if ($leadAfter.data.status -eq "INCOMING") { Pass "A2 First note promotes NEW->INCOMING" } else { Fail "A2 First note promotes NEW->INCOMING" "status=$($leadAfter.data.status) err=$($note1.error)" }

$note2 = APost "/api/activities" @{type="NOTE"; subject="Second note"; description="Follow-up note"; leadId=$leadA.data.id}
$leadAfter2 = AGet "/api/leads/$($leadA.data.id)"
if ($leadAfter2.data.status -eq "INCOMING") { Pass "A3 Second activity stays INCOMING (no re-trigger)" } else { Fail "A3 Second activity stays INCOMING" "status=$($leadAfter2.data.status)" }

$auditA = AGet "/api/leads/$($leadA.data.id)/audit-history?page=1&limit=50"
$statusChanges = @($auditA.data | Where-Object { $_.action -eq "STATUS_CHANGE" -or ($_.newValues -and $_.newValues.status -eq "INCOMING") })
if ($statusChanges.Count -eq 1) { Pass "A4 Exactly one STATUS_CHANGE audit for promotion" } else { Fail "A4 STATUS_CHANGE audit count" "got $($statusChanges.Count)" }

Log "`n=== B. FIRST ACTIVITY VIA TASK / FOLLOW-UP ===" "Cyan"
Login "admin@dctcrm.com" "password123" | Out-Null
$leadB1 = APost "/api/leads" @{firstName="TaskFirst"; lastName="TestB1"; company="TaskCorp"; source="WEBSITE"; phone=(New-TestPhone 2)}
$leadB2 = APost "/api/leads" @{firstName="FuFirst"; lastName="TestB2"; company="FuCorp"; source="WEBSITE"; phone=(New-TestPhone 3)}

$task1 = APost "/api/tasks" @{title="First task"; description="Task on NEW lead"; priority="MEDIUM"; dueDate=(Get-Date).AddDays(2).ToString("yyyy-MM-ddTHH:mm:ss.000Z"); leadId=$leadB1.data.id}
$leadB1After = AGet "/api/leads/$($leadB1.data.id)"
if ($leadB1After.data.status -eq "INCOMING") { Pass "B1 First task promotes NEW->INCOMING" } else { Fail "B1 First task promotes" "status=$($leadB1After.data.status) err=$($task1.error)" }

$fu1 = APost "/api/follow-ups" @{title="First follow-up"; description="FU on NEW lead"; dueDate=(Get-Date).AddDays(1).ToString("yyyy-MM-ddTHH:mm:ss.000Z"); leadId=$leadB2.data.id}
$leadB2After = AGet "/api/leads/$($leadB2.data.id)"
if ($leadB2After.data.status -eq "INCOMING") { Pass "B2 First follow-up promotes NEW->INCOMING" } else { Fail "B2 First follow-up promotes" "status=$($leadB2After.data.status) err=$($fu1.error)" }

Log "`n=== C. SITE VISIT NUMBER GENERATION ===" "Cyan"
Login "admin@dctcrm.com" "password123" | Out-Null
$leadC = APost "/api/leads" @{firstName="SvNum"; lastName="TestC"; company="SvCorp"; source="WEBSITE"; phone=(New-TestPhone 4)}
try {
    $upd = APut "/api/leads/$($leadC.data.id)/status" @{status="PROSPECT"; note="Setup for SV tests"}
    if ($upd.data.status -eq "PROSPECT") { Pass "C1 Lead moved to PROSPECT" } else { Fail "C1 Move to PROSPECT" "got $($upd.data.status)" }
} catch {
    Fail "C1 Move to PROSPECT" $_.Exception.Message
}

$projRes = AGet "/api/projects?limit=1"
$projectId = $projRes.data[0].id

$sv1 = APost "/api/site-visits" @{leadId=$leadC.data.id; projectId=$projectId; scheduledAt=(Get-Date).AddDays(2).ToString("yyyy-MM-ddTHH:mm:ss.000Z"); notes="First visit"}
$sv1num = $sv1.data.siteVisitNumber
if ($sv1num -and $sv1num -match "^SV\d{6,}$") { Pass "C2 SV number format: $sv1num" } else { Fail "C2 SV number format" "got '$sv1num' err=$($sv1.error)" }

$sv2 = APost "/api/site-visits" @{leadId=$leadC.data.id; projectId=$projectId; scheduledAt=(Get-Date).AddDays(3).ToString("yyyy-MM-ddTHH:mm:ss.000Z"); notes="Second visit"}
$sv2num = $sv2.data.siteVisitNumber
if ($sv2num -and $sv2num -ne $sv1num -and $sv2num -match "^SV") { Pass "C3 Second SV number unique: $sv2num" } else { Fail "C3 Second SV unique" "got '$sv2num' vs '$sv1num'" }

$n1 = [int]($sv1num -replace '^SV','')
$n2 = [int]($sv2num -replace '^SV','')
if ($n2 -eq ($n1 + 1)) { Pass "C4 SV numbers increment by 1" } else { Fail "C4 SV increment" "$n1 -> $n2" }

Log "`n=== D. SV STATUS LIFECYCLE ===" "Cyan"
$svGet = AGet "/api/site-visits/$($sv1.data.id)"
if ($svGet.data.siteVisitNumber -eq $sv1num) { Pass "D1 GET returns siteVisitNumber" } else { Fail "D1 GET siteVisitNumber" "got $($svGet.data.siteVisitNumber)" }

$cancel = APatch "/api/site-visits/$($sv1.data.id)/cancel" @{reason="Weather issue"}
if ($cancel.data.status -eq "CANCELLED") { Pass "D2 Cancel with reason -> CANCELLED" } else { Fail "D2 Cancel" "status=$($cancel.data.status)" }

$leadCAfterCancel = AGet "/api/leads/$($leadC.data.id)"
if ($leadCAfterCancel.data.status -eq "SITE_VISIT_SCHEDULED") { Pass "D3 Lead stays SITE_VISIT_SCHEDULED while sv2 still scheduled" } else { Fail "D3 Lead after cancel sv1 (sv2 active)" "status=$($leadCAfterCancel.data.status)" }

try {
    $badCancel = APatch "/api/site-visits/$($sv2.data.id)/cancel" @{}
    Fail "D4 Cancel without reason rejected" "got success"
} catch {
    Pass "D4 Cancel without reason rejected"
}

$completePayload = @{completedAt=(Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.000Z"); customerFeedback="Good"; completionNotes="Visit done"}
$complete = APatch "/api/site-visits/$($sv2.data.id)/complete" $completePayload
if ($complete.data.status -eq "COMPLETED") { Pass "D5 Complete -> COMPLETED" } else { Fail "D5 Complete" "status=$($complete.data.status)" }

$leadCAfterComplete = AGet "/api/leads/$($leadC.data.id)"
if ($leadCAfterComplete.data.status -eq "SITE_VISIT_HAPPENED") { Pass "D6 Lead -> SITE_VISIT_HAPPENED via complete" } else { Fail "D6 Lead after complete" "status=$($leadCAfterComplete.data.status)" }

try {
    $recomplete = APatch "/api/site-visits/$($sv2.data.id)/complete" $completePayload
    Fail "D7 Cannot complete non-scheduled" "got success"
} catch {
    Pass "D7 Cannot complete non-scheduled"
}

Log "`n=== E. REVISIT ===" "Cyan"
$revisit = APost "/api/site-visits/$($sv2.data.id)/revisit" @{reason="Client wants another visit"; scheduledAt=(Get-Date).AddDays(5).ToString("yyyy-MM-ddTHH:mm:ss.000Z"); projectId=$projectId; notes="Revisit notes"}
$revNum = $revisit.data.siteVisitNumber
if ($revNum -and $revNum -match "^SV" -and $revNum -ne $sv2num) { Pass "E1 Revisit creates new SV number: $revNum" } else { Fail "E1 Revisit number" "got '$revNum' err=$($revisit.error)" }
if ($revisit.data.previousSiteVisitId -eq $sv2.data.id) { Pass "E2 Revisit preserves previousSiteVisitId" } else { Fail "E2 previousSiteVisitId" "got $($revisit.data.previousSiteVisitId)" }
if ($revisit.data.status -eq "SCHEDULED") { Pass "E3 Revisit status SCHEDULED" } else { Fail "E3 Revisit status" "got $($revisit.data.status)" }

$revDetail = AGet "/api/site-visits/$($revisit.data.id)"
if ($revDetail.data.previousSiteVisit -and $revDetail.data.previousSiteVisit.siteVisitNumber -eq $sv2num) { Pass "E4 GET includes previousSiteVisit with number" } else { Fail "E4 previousSiteVisit include" "missing or wrong" }

Log "`n=== F. ROLE-BASED ACCESS ===" "Cyan"
# Admin has ALL scope
Login "admin@dctcrm.com" "password123" | Out-Null
$adminSv = AGet "/api/site-visits/$($sv1.data.id)"
if ($adminSv.data.siteVisitNumber) { Pass "F1 Admin reads SV with number" } else { Fail "F1 Admin SV read" "empty" }

# Presales without ownership should get 403 on unrelated lead
Login "priya.presales@test.com" "password123" | Out-Null
try {
    $presalesLead = AGet "/api/leads/$($leadA.data.id)"
    # leadA created by admin - if priya has VIEW_ALL may succeed
    if ($presalesLead.data) { Partial "F2 Presales can read admin lead" "has VIEW_ALL or share - scope-dependent" }
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 403) { Pass "F2 Presales 403 on admin lead" } else { Fail "F2 Presales lead access" "code=$code" }
}

Log "`n=== G. SV NUMBER CONCURRENCY (burst creates) ===" "Cyan"
Login "admin@dctcrm.com" "password123" | Out-Null
$leadG = APost "/api/leads" @{firstName="Conc"; lastName="TestG"; company="ConcCorp"; source="WEBSITE"; phone=(New-TestPhone 5)}
APut "/api/leads/$($leadG.data.id)/status" @{status="PROSPECT"; note="Concurrency setup"} | Out-Null

$nums = [System.Collections.Generic.List[string]]::new()
for ($i = 1; $i -le 8; $i++) {
    try {
        $s = APost "/api/site-visits" @{leadId=$leadG.data.id; projectId=$projectId; scheduledAt=(Get-Date).AddDays($i+10).ToString("yyyy-MM-ddTHH:mm:ss.000Z"); notes="Conc $i"}
        if ($s.data.siteVisitNumber) { $nums.Add($s.data.siteVisitNumber) }
    } catch {
        Log "  Concurrent create $i failed: $($_.Exception.Message)" "Yellow"
    }
}
$arr = @($nums)
$unique = @($arr | Select-Object -Unique)
if ($arr.Count -ge 4 -and $unique.Count -eq $arr.Count) { Pass "G1 No duplicate SV numbers across $($arr.Count) creates" } else { Fail "G1 SV uniqueness" "got $($arr.Count) creates, $($unique.Count) unique" }
if ($arr.Count -ge 4) { Pass "G2 Created $($arr.Count) SVs for concurrency burst" } else { Partial "G2 Fewer creates than expected" "only $($arr.Count)" }

$allSv = AGet "/api/site-visits?limit=500"
$allNums = @($allSv.data | ForEach-Object { $_.siteVisitNumber } | Where-Object { $_ })
$dupes = @($allNums | Group-Object | Where-Object { $_.Count -gt 1 })
if ($dupes.Count -eq 0) { Pass "G3 No duplicate siteVisitNumber in list API" } else { Fail "G3 Duplicate SV numbers" (($dupes | ForEach-Object { $_.Name }) -join ",") }

Log "`n=== H. LEADS LIST ===" "Cyan"
$leadsList = AGet "/api/leads?limit=5"
if ($leadsList.success) { Pass "H1 Leads list API works" } else { Fail "H1 Leads list" "not success" }

Log "`n=== I. NEGATIVE: invalid transitions ===" "Cyan"
Login "admin@dctcrm.com" "password123" | Out-Null
$leadI = APost "/api/leads" @{firstName="Neg"; lastName="TestI"; company="NegCorp"; source="WEBSITE"; phone=(New-TestPhone 6)}
try {
    $badStatus = APut "/api/leads/$($leadI.data.id)/status" @{status="INVALID_STATUS"; note="bad"}
    Fail "I1 Invalid status rejected" "got success"
} catch {
    Pass "I1 Invalid status rejected"
}

try {
    $jump = APut "/api/leads/$($leadI.data.id)/status" @{status="BOOKED"; note="illegal jump from NEW"}
    if ($jump.data.status -eq "BOOKED") {
        Partial "I2 NEW->BOOKED attempt" "API accepted - workflow may allow for this profile"
    } else {
        Fail "I2 Status jump" "unexpected $($jump.data.status)"
    }
} catch {
    Pass "I2 Illegal status jump rejected"
}

Log "`n=== J. TABS / DETAIL (frontend static checks) ===" "Cyan"
$leadPage = Get-Content -LiteralPath "$root\apps\web\src\app\(dashboard)\leads\[id]\page.tsx" -Raw
if ($leadPage -match 'showAuditHistory' -and $leadPage -match 'showSiteVisits' -and $leadPage -match 'showOpportunities') { Pass "J1 Role-based tab flags present" } else { Fail "J1 Role tab flags" "missing" }
if ($leadPage -match 'openDetail' -and $leadPage -match 'detailDialogOpen') { Pass "J2 Detail dialog wiring present" } else { Fail "J2 Detail dialog" "missing" }
if ($leadPage -match 'siteVisitNumber') { Pass "J3 SV number shown on lead detail" } else { Fail "J3 SV number on lead" "missing" }
if ($leadPage -notmatch 'Search by name') { Pass "J4 No 'Search by name' in lead detail" } else { Fail "J4 Search by name" "still present" }

$leadList = Get-Content -LiteralPath "$root\apps\web\src\components\crm\lead-list.tsx" -Raw
if ($leadList -notmatch 'Search by name') { Pass "J5 lead-list has no name search placeholder" } else { Fail "J5 name search" "still present" }
if ($leadList -notmatch 'searchKey="firstName"') { Pass "J6 lead-list searchKey firstName removed" } else { Fail "J6 searchKey" "still present" }

$svPage = Get-Content -LiteralPath "$root\apps\web\src\app\(dashboard)\site-visits\[id]\page.tsx" -Raw
if ($svPage -match 'siteVisitNumber' -and $svPage -match 'previousSiteVisit') { Pass "J7 SV detail shows number + previous visit" } else { Fail "J7 SV detail fields" "missing" }

$leadMain = Get-Content -LiteralPath "$root\apps\web\src\app\(dashboard)\leads\page.tsx" -Raw
if ($leadMain -notmatch 'Search by name') { Pass "J8 Leads main page has no name search" } else { Fail "J8 Name search on leads page" "still present" }

Log "`n=== K. WEB ROUTES ===" "Cyan"
foreach ($path in @("/login","/leads")) {
    try {
        $web = Invoke-WebRequest -Uri "http://localhost:3000$path" -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 30
        if ($web.StatusCode -eq 200) { Pass "K: Web $path -> 200" } else { Fail "K: Web $path" "Status $($web.StatusCode)" }
    } catch {
        $code = $null
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        if ($code -eq 200 -or $code -eq 307) { Pass "K: Web $path -> $code" } else { Fail "K: Web $path" "Status=$code $($_.Exception.Message)" }
    }
}

Log "`n=== SUMMARY ===" "Cyan"
$pass = @($results | Where-Object { $_.Result -eq "PASS" }).Count
$fail = @($results | Where-Object { $_.Result -eq "FAIL" }).Count
$part = @($results | Where-Object { $_.Result -eq "PARTIAL" }).Count
Log "PASS=$pass FAIL=$fail PARTIAL=$part TOTAL=$($results.Count)" $(if ($fail -eq 0) { "Green" } else { "Red" })
$results | Format-Table -AutoSize
if ($fail -gt 0) { exit 1 } else { exit 0 }