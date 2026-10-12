$baseUrl = "http://localhost:3001"
$results = @()
function Log($msg, $color = "White") { Write-Host $msg -ForegroundColor $color }
function Pass($area) { $script:results += [PSCustomObject]@{ Area=$area; Result="PASS" }; Log "  PASS: $area" "Green" }
function Fail($area, $detail) { $script:results += [PSCustomObject]@{ Area=$area; Result="FAIL" }; Log "  FAIL: $area - $detail" "Red" }

function Login($email, $pass) {
    $body = "{`"email`":`"$email`",`"password`":`"$pass`"}"
    $resp = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body $body
    $script:token = $resp.data.token
    return $resp.data
}
function AuthHeaders() { return @{"Authorization"="Bearer $script:token"} }
function AGet($url) { return Invoke-RestMethod -Uri "$baseUrl$url" -Headers (AuthHeaders) }

Login "admin@dctcrm.com" "password123" | Out-Null

# 1. Reports list + find export targets
$reports = AGet "/api/reports?limit=50"
if ($reports.data.items) { $reportList = @($reports.data.items) } else { $reportList = @($reports.data) }
Log "`n=== REPORTS ($($reportList.Count)) ===" "Cyan"
foreach ($r in $reportList) { Log "  $($r.id) | $($r.name) | $($r.objectName) | $($r.type)" }

# 2. Export each report CSV + Excel
foreach ($r in $reportList) {
    foreach ($fmt in @("csv", "excel")) {
        $name = "Export $($r.name) [$fmt]"
        try {
            $resp = Invoke-WebRequest -Uri "$baseUrl/api/reports/$($r.id)/export?format=$fmt" -Headers (AuthHeaders) -TimeoutSec 30 -UseBasicParsing
            $ct = $resp.Headers['Content-Type']
            $len = $resp.RawContentLength
            if ($resp.StatusCode -eq 200 -and $len -gt 0) {
                Pass "$name ($len bytes, $ct)"
            } else {
                Fail "$name" "status=$($resp.StatusCode) len=$len"
            }
        } catch {
            $msg = $_.ErrorDetails.Message
            if (-not $msg) { $msg = $_.Exception.Message }
            Fail "$name" $msg
        }
    }
}

# 3. Run summary reports (status/source with count)
foreach ($r in ($reportList | Where-Object { $_.name -like "Lead by *" })) {
    try {
        $run = Invoke-RestMethod -Uri "$baseUrl/api/reports/run" -Method POST -ContentType "application/json" -Headers (AuthHeaders) -Body (@{ objectName=$r.objectName; columns=$r.columns; groupBy=$r.groupBy; rowGroups=@($r.groupBy); aggregates=@(@{function="count"}) } | ConvertTo-Json -Depth 10)
        if ($run.success -and $run.data.groups) {
            Pass "Run $($r.name) groups=$($run.data.groups.Count) total=$($run.data.totalRows)"
        } elseif ($run.success) {
            Pass "Run $($r.name) rows=$($run.data.totalRows) (no groups)"
        } else {
            Fail "Run $($r.name)" ($run.error | ConvertTo-Json -Compress)
        }
    } catch {
        $msg = $_.ErrorDetails.Message
        if (-not $msg) { $msg = $_.Exception.Message }
        Fail "Run $($r.name)" $msg
    }
}

# 4. Lead number search: leads list + global search + quick search
$lead = AGet "/api/leads?limit=1"
if ($lead.data.Count -ge 1) {
    $ln = $lead.data[0].leadNumber
    Log "`n=== SEARCH leadNumber=$ln ===" "Cyan"
    $listSearch = AGet "/api/leads?search=$ln"
    if ($listSearch.data.Count -ge 1 -and $listSearch.data[0].leadNumber -eq $ln) { Pass "Leads list search by leadNumber" } else { Fail "Leads list search by leadNumber" "got $($listSearch.data.Count)" }

    $globalSearch = AGet "/api/search?q=$ln"
    if ($globalSearch.data.Count -ge 1) { Pass "Global /api/search by leadNumber (count=$($globalSearch.data.Count))" } else { Fail "Global /api/search by leadNumber" "got 0" }

    $quick = AGet "/api/search/quick?q=$ln"
    if ($quick.data.leads.Count -ge 1) { Pass "Quick search by leadNumber (count=$($quick.data.leads.Count))" } else { Fail "Quick search by leadNumber" "got 0" }
} else {
    Fail "Lead for search" "no leads found"
}

# 5. Lead detail lastModified + audit history
if ($lead.data.Count -ge 1) {
    $id = $lead.data[0].id
    $detail = AGet "/api/leads/$id"
    if ($detail.data.PSObject.Properties.Name -contains "lastModified") { Pass "Lead lastModified field present" } else { Fail "Lead lastModified field" "missing" }
    try {
        $hist = AGet "/api/leads/$id/audit-history?page=1&limit=20"
        if ($hist.data -ne $null) { Pass "Audit history endpoint OK (entries=$(@($hist.data).Count))" } else { Fail "Audit history" "no data" }
    } catch { $msg = $_.ErrorDetails.Message; if (-not $msg) { $msg = $_.Exception.Message }; Fail "Audit history" $msg }
}

# 6. Removed routes 404
foreach ($path in @("/api/accounts", "/api/contacts", "/api/customers")) {
    try {
        Invoke-RestMethod -Uri "$baseUrl$path" -Headers (AuthHeaders) -TimeoutSec 5 | Out-Null
        Fail "Removed route $path" "expected 404"
    } catch {
        $status = $null
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        if ($status -eq 404) { Pass "Removed route $path returns 404" } else { Fail "Removed route $path" "status=$status" }
    }
}

# Summary
$pass = @($results | Where-Object { $_.Result -eq "PASS" }).Count
$fail = @($results | Where-Object { $_.Result -eq "FAIL" }).Count
Log "`n=== VERIFY SUMMARY: PASS=$pass FAIL=$fail ===" $(if ($fail -eq 0) { "Green" } else { "Red" })
$results | Where-Object { $_.Result -eq "FAIL" } | ForEach-Object { Log "  FAIL: $($_.Area)" "Red" }
if ($fail -gt 0) { exit 1 } else { exit 0 }
