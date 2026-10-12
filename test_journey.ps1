# Journey test: Lead -> SiteVisit -> Convert -> Opportunity -> Quotation -> Booking -> Payment -> Reports
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:pass = 0; $script:fail = 0
function Pass($m) { $script:pass++; Write-Host "PASS: $m" -ForegroundColor Green }
function Fail($m, $d) { $script:fail++; Write-Host "FAIL: $m - $d" -ForegroundColor Red }

$base = 'http://localhost:3001/api'
function Login($email, $pw) {
    Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' `
        -Body (@{ email = $email; password = $pw } | ConvertTo-Json)
}
function JGet($url, $tok) { Invoke-RestMethod -Uri $url -Headers @{ Authorization = "Bearer $tok" } }
function JPost($url, $body, $tok) {
    Invoke-RestMethod -Uri $url -Method Post -Headers @{ Authorization = "Bearer $tok" } `
        -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 6)
}
function JPut($url, $body, $tok) {
    Invoke-RestMethod -Uri $url -Method Put -Headers @{ Authorization = "Bearer $tok" } `
        -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 6)
}
function JPatch($url, $body, $tok) {
    Invoke-RestMethod -Uri $url -Method Patch -Headers @{ Authorization = "Bearer $tok" } `
        -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 6)
}
function TryCall($name, $fn) {
    try { $r = & $fn; return $r }
    catch {
        $status = $null
        try { $status = [int]$_.Exception.Response.StatusCode } catch {}
        Fail $name "HTTP $status $($_.Exception.Message)"
        return $null
    }
}

Write-Host "`n=== JOURNEY 1: login + lead create ===" -ForegroundColor Cyan
$a = Login 'admin@dctcrm.com' 'password123'
if ($a.success -and $a.data.token) { Pass "1.1 admin login" } else { Fail "1.1 admin login" ($a | ConvertTo-Json -Compress) }
$tok = $a.data.token

$phone = 'JRN' + (Get-Random -Minimum 100000000 -Maximum 999999999)
$lead = TryCall "1.2 lead create" { JPost "$base/leads" @{
    firstName = 'Journey'; lastName = 'Tester'; company = 'JourneyCo'
    source = 'WEBSITE'; phone = $phone; status = 'NEW'
} $tok }
if ($lead -and $lead.data.id) { Pass "1.2 lead created ($($lead.data.leadNumber))" } else { Fail "1.2 lead created" "no data" }
$leadId = $lead.data.id
if ($lead.data.status -eq 'NEW') { Pass "1.3 lead status NEW" } else { Fail "1.3 lead status NEW" "$($lead.data.status)" }

$st = TryCall "1.4 status NEW->PROSPECT" { JPut "$base/leads/$leadId/status" @{ status = 'PROSPECT'; note = 'journey qualify' } $tok }
if ($st -and $st.data.status -eq 'PROSPECT') { Pass "1.4 lead -> PROSPECT" } else { Fail "1.4 lead status" "$($st.data.status)" }

Write-Host "`n=== JOURNEY 2: schedule + complete site visit ===" -ForegroundColor Cyan
$proj = (JGet "$base/projects?limit=1" $tok).data[0]
$sv = TryCall "2.1 schedule SV" { JPost "$base/site-visits" @{
    leadId = $leadId; projectId = $proj.id
    scheduledAt = ([DateTime]::UtcNow.AddDays(1).ToString("yyyy-MM-ddTHH:mm:ss.000Z"))
    notes = 'Journey scheduling'
} $tok }
if ($sv -and $sv.data.id) { Pass "2.1 site visit scheduled ($($sv.data.siteVisitNumber))" } else { Fail "2.1 schedule SV" "no data" }
$svId = $sv.data.id

$l2 = JGet "$base/leads/$leadId" $tok
if ($l2.data.status -eq 'SITE_VISIT_SCHEDULED') { Pass "2.2 lead -> SITE_VISIT_SCHEDULED" } else { Fail "2.2 lead status" "$($l2.data.status)" }

$done = TryCall "2.3 complete SV" { JPatch "$base/site-visits/$svId/complete" @{
    completedAt = ([DateTime]::UtcNow.AddDays(1).AddHours(1).ToString("yyyy-MM-ddTHH:mm:ss.000Z"))
    customerFeedback = 'Journey completed - interested'
    completionNotes = 'Journey completion notes'
} $tok }
if ($done) { Pass "2.3 site visit completed" } else { Fail "2.3 complete SV" "no data" }

$l3 = JGet "$base/leads/$leadId" $tok
if ($l3.data.status -eq 'SITE_VISIT_HAPPENED') { Pass "2.4 lead -> SITE_VISIT_HAPPENED" } else { Fail "2.4 lead status" "$($l3.data.status)" }

Write-Host "`n=== JOURNEY 3: convert -> opportunity ===" -ForegroundColor Cyan
$conv = TryCall "3.1 convert" { JPost "$base/leads/$leadId/convert" @{
    projectId = $proj.id; name = 'Journey Opportunity'; amount = 500000
} $tok }
if ($conv -and $conv.data.opportunity.id) { Pass "3.1 converted ($($conv.data.opportunity.opportunityNumber))" } else { Fail "3.1 convert" "no opportunity" }
$oppId = $conv.data.opportunity.id

$l4 = JGet "$base/leads/$leadId" $tok
if ($l4.data.status -eq 'BOOKED') { Pass "3.2 lead -> BOOKED" } else { Fail "3.2 lead status" "$($l4.data.status)" }

$stage = TryCall "3.3 stage -> PROPOSAL" { JPatch "$base/opportunities/$oppId/stage" @{ stage = 'PROPOSAL' } $tok }
if ($stage -and $stage.data.stage -eq 'PROPOSAL') { Pass "3.3 opportunity stage PROPOSAL" } else { Fail "3.3 stage change" "stage=$($stage.data.stage)" }

Write-Host "`n=== JOURNEY 4: quotation -> booking -> payment ===" -ForegroundColor Cyan
$qt = TryCall "4.1 quotation" { JPost "$base/quotations" @{
    opportunityId = $oppId; projectId = $proj.id
    items = @(@{ description = 'Journey unit item'; quantity = 1; unitPrice = 500000 })
} $tok }
if ($qt -and $qt.data.id) { Pass "4.1 quotation created ($($qt.data.quotationNumber))" } else { Fail "4.1 quotation" "no data" }
$qtId = $qt.data.id

$units = JGet "$base/units?projectId=$($proj.id)&status=AVAILABLE&limit=5" $tok
$unit = $units.data | Select-Object -First 1
if (-not $unit) { $units = JGet "$base/units?status=AVAILABLE&limit=5" $tok; $unit = $units.data | Select-Object -First 1 }
if (-not $unit) { Fail "4.2 available unit" "none" } else { Pass "4.2 available unit found" }

$bk = $null
if ($unit) {
    $bk = TryCall "4.3 booking" { JPost "$base/bookings" @{
        quotationId = $qtId; projectId = $proj.id; unitId = $unit.id
        totalAmount = 500000; notes = 'Journey booking'
    } $tok }
}
if ($bk -and $bk.data.id) { Pass "4.3 booking created ($($bk.data.bookingNumber))" } else { Fail "4.3 booking" "no data" }
$bkId = $bk.data.id

$pay = TryCall "4.4 payment" { JPost "$base/payments" @{ bookingId = $bkId; amount = 100000; notes = 'Journey part payment' } $tok }
if ($pay -and $pay.data.id) { Pass "4.4 payment created ($($pay.data.paymentNumber))" } else { Fail "4.4 payment" "no data" }

Write-Host "`n=== JOURNEY 5: audit / search / reports / dashboard ===" -ForegroundColor Cyan
$hist = TryCall "5.1 lead audit history" { JGet "$base/leads/$leadId/audit-history?limit=50" $tok }
if ($hist -and $hist.data) {
    $entries = if ($hist.data.logs) { $hist.data.logs } elseif ($hist.data.items) { $hist.data.items } else { $hist.data }
    $cnt = @($entries).Count
    if ($cnt -ge 3) { Pass "5.1 audit history entries ($cnt)" } else { Fail "5.1 audit history" "only $cnt entries" }
} else { Fail "5.1 audit history" "no data" }

$srch = TryCall "5.2 search lead" { JGet "$base/search?q=$($lead.data.leadNumber)" $tok }
if ($srch) {
    $found = $false
    foreach ($f in @($srch.data.results + $srch.data.leads + $srch.data)) {
        if ($f -is [string]) { continue }
        if ($f.id -eq $leadId -or $f.leadNumber -eq $lead.data.leadNumber) { $found = $true; break }
    }
    if ($found) { Pass "5.2 lead found in search" } else { Fail "5.2 search" "lead not found" }
} else { Fail "5.2 search" "request failed" }

$reps = TryCall "5.3 reports list" { JGet "$base/reports?limit=5" $tok }
if ($reps -ne $null) { Pass "5.3 reports list 200" } else { Fail "5.3 reports" "failed" }

$dash = TryCall "5.4 dashboards list" { JGet "$base/dashboards?limit=5" $tok }
if ($dash -ne $null) { Pass "5.4 dashboards list 200" } else { Fail "5.4 dashboards" "failed" }

Write-Host "`n=== JOURNEY 6: negative (re-convert + closed-lost) ===" -ForegroundColor Cyan
$reconvOk = $false; $reconvNote = ''
try {
    $conv2 = JPost "$base/leads/$leadId/convert" @{ projectId = $proj.id } $tok
    $reconvOk = ($conv2.data.opportunity.id -eq $oppId)
    $reconvNote = 'same opportunity returned'
}
catch {
    $status = 0
    try { $status = [int]$_.Exception.Response.StatusCode } catch {}
    $reconvOk = ($status -eq 400 -or $status -eq 409)
    $reconvNote = "rejected with $status (lead now BOOKED - duplicate blocked)"
}
if ($reconvOk) { Pass "6.1 re-convert does not duplicate ($reconvNote)" } else { Fail "6.1 re-convert" $reconvNote }

$lost = TryCall "6.2 stage CLOSED_LOST negative" { JPatch "$base/opportunities/$oppId/stage" @{ stage = 'CLOSED_LOST'; lostReason = 'journey end' } $tok }
if ($lost -and $lost.data.stage -eq 'CLOSED_LOST') { Pass "6.2 stage CLOSED_LOST (terminal)" } else { Fail "6.2 stage" "failed" }

Write-Host "`n================ JOURNEY SUMMARY ================" -ForegroundColor Cyan
Write-Host "PASS: $script:pass  FAIL: $script:fail"
if ($script:fail -gt 0) { exit 1 } else { exit 0 }