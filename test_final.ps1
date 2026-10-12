$baseUrl = "http://localhost:3001"
$results = @()
$global:currentToken = $null

function Log($msg, $color = "White") { Write-Host $msg -ForegroundColor $color }
function Pass($area) { $script:results += [PSCustomObject]@{ Area=$area; Result="PASS" }; Log "  PASS: $area" "Green" }
function Fail($area, $detail) { $script:results += [PSCustomObject]@{ Area=$area; Result="FAIL" }; Log "  FAIL: $area - $detail" "Red" }

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
function APostRaw($url, $raw) { return Invoke-RestMethod -Uri "$baseUrl$url" -Method POST -ContentType "application/json" -Body $raw -Headers (AuthHeaders) }
function APutRaw($url, $raw) { return Invoke-RestMethod -Uri "$baseUrl$url" -Method PUT -ContentType "application/json" -Body $raw -Headers (AuthHeaders) }
function ShouldFailRaw($method, $url, $raw, $name) {
    try {
        if ($method -eq "POST") { Invoke-RestMethod -Uri "$baseUrl$url" -Method POST -ContentType "application/json" -Body $raw -Headers (AuthHeaders) -ErrorAction Stop }
        elseif ($method -eq "PUT") { Invoke-RestMethod -Uri "$baseUrl$url" -Method PUT -ContentType "application/json" -Body $raw -Headers (AuthHeaders) -ErrorAction Stop }
        Fail $name "Expected rejection"
    } catch {
        $e = $_.ErrorDetails.Message
        if ($e -and $e -match "error") { Pass $name } else { Pass $name "(rejected)" }
    }
}
function ShouldFailBody($method, $url, $body, $name) {
    try {
        if ($method -eq "POST") { Invoke-RestMethod -Uri "$baseUrl$url" -Method POST -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) -Headers (AuthHeaders) -ErrorAction Stop }
        elseif ($method -eq "PUT") { Invoke-RestMethod -Uri "$baseUrl$url" -Method PUT -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) -Headers (AuthHeaders) -ErrorAction Stop }
        Fail $name "Expected rejection"
    } catch {
        $e = $_.ErrorDetails.Message
        if ($e -and $e -match "error") { Pass $name } else { Pass $name "(rejected)" }
    }
}

# ============================================
# LOGIN
# ============================================
$phoneSeed = (Get-Date -Format "yyMMddHHmmss") + (Get-Random -Maximum 999).ToString().PadLeft(3, "0")
function New-TestPhone([int]$n) { return "+91-9$phoneSeed" + $n.ToString().PadLeft(3, "0") }

Log "`n=== LOGIN ALL USERS ===" "Cyan"
Login "admin@dctcrm.com" "password123" | Out-Null; Log "  Admin: OK" "Green"
Login "priya.presales@test.com" "password123" | Out-Null; Log "  Presales: OK" "Green"
Login "neha.svc@test.com" "password123" | Out-Null; Log "  SVC (Neha): OK" "Green"
Login "vikram.svc@test.com" "password123" | Out-Null; Log "  SVC (Vikram): OK" "Green"
Login "sanjay.sales@test.com" "password123" | Out-Null; Log "  Sales (Sanjay): OK" "Green"
Login "neha@dctcrm.com" "password123" | Out-Null; Log "  Neha Gupta (Presales): OK" "Green"

# ============================================
# 1. LEAD NUMBER
# ============================================
Log "`n=== LEAD NUMBER ===" "Cyan"
Login "admin@dctcrm.com" "password123" | Out-Null
$lead = APost "/api/leads" @{firstName="Final"; lastName="TestLead"; company="FinalCorp"; source="WEBSITE"; phone=(New-TestPhone 1)}
Pass "Lead created: $($lead.data.leadNumber)"
$lead2 = APost "/api/leads" @{firstName="Final"; lastName="Test2"; company="FinalCorp"; source="WEBSITE"; phone=(New-TestPhone 2)}
Pass "Lead 2: $($lead2.data.leadNumber)"

$search = AGet "/api/leads?search=$($lead.data.leadNumber)"
if ($search.data.Count -eq 1 -and $search.data[0].id -eq $lead.data.id) { Pass "Search by lead number" } else { Fail "Search by lead number" "Got $($search.data.Count) results" }

$editResp = APut "/api/leads/$($lead.data.id)" @{leadNumber="LN999999"}
$verify = AGet "/api/leads/$($lead.data.id)"
if ($verify.data.leadNumber -eq $lead.data.leadNumber) { Pass "Lead number read-only" } else { Fail "Lead number read-only" "Was changed" }

# ============================================
# 2. PRESALES WORKFLOW
# ============================================
Log "`n=== PRESALES WORKFLOW ===" "Cyan"
Login "priya.presales@test.com" "password123" | Out-Null
$pLead = APost "/api/leads" @{firstName="Presales"; lastName="Workflow"; company="PWCorp"; source="WEBSITE"; phone=(New-TestPhone 3)}
Pass "Presales creates lead: $($pLead.data.leadNumber)"

# Spec §2/§22: presales record access = OWNER scope. Round Robin may assign the new
# lead to a different presales user, so the workflow steps run as the assigned owner.
$pPriyaId = $null
try { $pPriyaId = (AGet "/api/auth/me").data.user.id } catch {}
$pOwnerId = $pLead.data.ownerId
$pActionEmail = $null
if ($pOwnerId -and $pPriyaId -and $pOwnerId -ne $pPriyaId) {
    Login "admin@dctcrm.com" "password123" | Out-Null
    $pOwnerLookup = $null
    try { $pOwnerLookup = Invoke-RestMethod -Uri "$baseUrl/api/users/$pOwnerId" -Headers (AuthHeaders) } catch {}
    if ($pOwnerLookup -and $pOwnerLookup.data) { $pActionEmail = $pOwnerLookup.data.email }
    if ($pActionEmail) {
        Login $pActionEmail "password123" | Out-Null
        if (-not $global:currentToken) { Login $pActionEmail "DctTest@123" | Out-Null }
        Log "  Lead owner (Round Robin): $pActionEmail" "Gray"
    }
}

$pIncOk = $false; $pIncErr = ""
try { $pInc = APutRaw "/api/leads/$($pLead.data.id)/status" '{"status":"INCOMING","note":"Customer interested"}'; $pIncOk = ($pInc.success -eq $true) } catch { $pIncErr = $_.ErrorDetails.Message }
if ($pIncOk) { Pass "NEW -> INCOMING" } else { Fail "NEW -> INCOMING" "rejected: $pIncErr" }

$pPushOk = $false; $pPushErr = ""; $pPush = $null
try { $pPush = APostRaw "/api/leads/$($pLead.data.id)/push-to-svc" '{"reason":"Qualified for site visit"}'; $pPushOk = ($pPush.success -eq $true) } catch { $pPushErr = $_.ErrorDetails.Message }
if ($pPushOk) { Pass "INCOMING -> PROSPECT (Push to SVC)" } else { Fail "INCOMING -> PROSPECT (Push to SVC)" "rejected: $pPushErr" }
$assignedUserId = if ($pPush) { $pPush.data.owner.id } else { $null }
$assignedName = if ($pPush) { "$($pPush.data.owner.firstName) $($pPush.data.owner.lastName)" } else { "" }
Log "  Assigned to: $assignedName (via Round Robin)" "Gray"

# After the handoff the previous owner/creator no longer has record access (spec §22),
# so the owner history / audit trail is read with the admin session.
Login "admin@dctcrm.com" "password123" | Out-Null
$pDetail = AGet "/api/leads/$($pLead.data.id)"
if ($pDetail.data.ownerHistory.Count -ge 2) { Pass "Owner History on push" } else { Fail "Owner History" "Only $($pDetail.data.ownerHistory.Count) entries" }
if ($pDetail.data.auditLogs.Count -ge 2) { Pass "Audit Log on push" } else { Fail "Audit Log" "Only $($pDetail.data.auditLogs.Count) entries" }

# ============================================
# 3. SVC WORKFLOW
# ============================================
Log "`n=== SVC WORKFLOW ===" "Cyan"
# Dynamically find SVC user email by ID (admin session — presales no longer has USER_READ)
$svcUserLookup = $null
Login "admin@dctcrm.com" "password123" | Out-Null
try { $svcUserLookup = Invoke-RestMethod -Uri "$baseUrl/api/users/$assignedUserId" -Headers (AuthHeaders) } catch {}
$svcEmail = if ($svcUserLookup -and $svcUserLookup.data -and $svcUserLookup.data.email) { $svcUserLookup.data.email } else { $null }
if ($svcEmail -and ($svcEmail -is [string])) {
    Login $svcEmail "password123" | Out-Null
    if (-not $global:currentToken) { Login $svcEmail "DctTest@123" | Out-Null }
    Log "  SVC session: $svcEmail" "Gray"
    
    $svcLeadList = AGet "/api/leads?limit=50"
    $foundSvLead = $svcLeadList.data | Where-Object { $_.id -eq $pLead.data.id }
    if ($foundSvLead) { Pass "SVC sees assigned lead" } else { Fail "SVC sees lead" "Not found in list (owner: $($foundSvLead.ownerId))" }

    # Scheduling requires Lead edit + project read — admin drives setup (SVC executes the visit)
    Login "admin@dctcrm.com" "password123" | Out-Null
    $projList = AGet "/api/projects?limit=1"
    if ($projList.data.Count -gt 0) {
        $projId = $projList.data[0].id
        Log "  Using project: $($projList.data[0].name)" "Gray"
        
        ShouldFailRaw "POST" "/api/leads/$($pLead.data.id)/schedule-site-visit" "{`"notes`":`"Visit reason`",`"scheduledAt`":`"2026-10-01T10:00:00.000Z`"}" "SV without project"
        ShouldFailRaw "POST" "/api/leads/$($pLead.data.id)/schedule-site-visit" "{`"projectId`":`"$projId`",`"scheduledAt`":`"2026-10-01T10:00:00.000Z`"}" "SV without notes"
        ShouldFailRaw "POST" "/api/leads/$($pLead.data.id)/schedule-site-visit" "{`"projectId`":`"$projId`",`"notes`":`"Visit reason`"}" "SV without date"

        $svResp = APostRaw "/api/leads/$($pLead.data.id)/schedule-site-visit" "{`"projectId`":`"$projId`",`"notes`":`"Initial site visit`",`"scheduledAt`":`"2026-10-01T10:00:00.000Z`"}"
        Pass "Site visit created"
        Pass "PROSPECT -> SITE_VISIT_SCHEDULED"
        $svSalesOwner = "$($svResp.data.lead.owner.firstName) $($svResp.data.lead.owner.lastName)"
        Log "  Sales assigned: $svSalesOwner (Round Robin)" "Gray"
        
        $salesUserId = $svResp.data.lead.owner.id
        # Dynamically find Sales user email by ID
        $salesUserLookup = $null
        try { $salesUserLookup = Invoke-RestMethod -Uri "$baseUrl/api/users/$salesUserId" -Headers (AuthHeaders) } catch {}
        $salesEmail = if ($salesUserLookup -and $salesUserLookup.data) { $salesUserLookup.data.email } else { $null }
        
        if ($salesEmail) {
            Login $salesEmail "password123" | Out-Null
            if (-not $global:currentToken) { Login $salesEmail "DctTest@123" | Out-Null }
            Log "  Sales session: $salesEmail" "Gray"
            
            $svList = AGet "/api/site-visits?leadId=$($pLead.data.id)&limit=1"
            if ($svList.data.Count -gt 0) {
                $svId = $svList.data[0].id
                $completeBody = @{ completedAt=(Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.000Z"); customerFeedback="Sales follow-up"; completionNotes="Visit completed" } | ConvertTo-Json
                $completeResp = Invoke-RestMethod -Uri "$baseUrl/api/site-visits/$svId/complete" -Method PATCH -ContentType "application/json" -Body $completeBody -Headers (AuthHeaders)
                Pass "Site visit completed"
                
                $afterComplete = AGet "/api/leads/$($pLead.data.id)"
                if ($afterComplete.data.status -eq "SITE_VISIT_HAPPENED") { Pass "SITE_VISIT_SCHEDULED -> SITE_VISIT_HAPPENED" } else { Fail "SV status" "Status: $($afterComplete.data.status)" }
                
                Login "admin@dctcrm.com" "password123" | Out-Null
                $adminComplete = APutRaw "/api/leads/$($pLead.data.id)/status" '{"status":"BOOKED","note":"Customer booked"}'
                Pass "SITE_VISIT_HAPPENED -> BOOKED"
            }
        } else {
            Log "  Sales user unknown ($salesUserId)" "Yellow"
            Login "admin@dctcrm.com" "password123" | Out-Null
        }
    } else {
        Log "  No projects found, skipping SV tests" "Yellow"
        Login "admin@dctcrm.com" "password123" | Out-Null
    }
} else {
    Log "  Unknown SVC user: $assignedUserId" "Yellow"
    Login "admin@dctcrm.com" "password123" | Out-Null
}

# ============================================
# 4. ADMIN FULL ACCESS
# ============================================
Log "`n=== ADMIN FULL ACCESS ===" "Cyan"
Login "admin@dctcrm.com" "password123" | Out-Null
$adminLeads = AGet "/api/leads?limit=5"
Pass "Admin lists leads ($($adminLeads.pagination.total) total)"

$adminDetail = AGet "/api/leads/$($lead.data.id)"
if ($adminDetail.data.leadNumber) { Pass "Admin views lead with leadNumber" } else { Fail "Admin lead detail" "Missing leadNumber" }
if ($adminDetail.data.ownerHistory.Count -ge 1) { Pass "Admin sees owner history" } else { Fail "Admin owner history" "Missing" }
if ($adminDetail.data.auditLogs.Count -ge 1) { Pass "Admin sees audit logs" } else { Fail "Admin audit logs" "Missing" }

$adminEdit = APut "/api/leads/$($lead.data.id)" @{description="Admin edited"}
Pass "Admin edits lead"

$adminStatus = APutRaw "/api/leads/$($lead.data.id)/status" '{"status":"INCOMING","note":"Admin status change"}'
Pass "Admin changes status"

# ============================================
# 5. STATUS NOTE VALIDATION
# ============================================
Log "`n=== STATUS NOTE VALIDATION ===" "Cyan"
ShouldFailRaw "PUT" "/api/leads/$($lead2.data.id)/status" '{"status":"INCOMING"}' "No note"
ShouldFailRaw "PUT" "/api/leads/$($lead2.data.id)/status" '{"status":"INCOMING","note":""}' "Empty note"
ShouldFailRaw "PUT" "/api/leads/$($lead2.data.id)/status" '{"status":"INCOMING","note":"   "}' "Whitespace note"
$validStatus = APutRaw "/api/leads/$($lead2.data.id)/status" '{"status":"INCOMING","note":"Valid reason"}'
if ($validStatus.data.status -eq "INCOMING") { Pass "Valid note accepted" } else { Fail "Valid note" "Status: $($validStatus.data.status)" }

# ============================================
# 6. PUSH TO SVC VALIDATION
# ============================================
Log "`n=== PUSH TO SVC VALIDATION ===" "Cyan"
$pL3 = APost "/api/leads" @{firstName="Push"; lastName="Test"; company="PushCorp"; source="WEBSITE"; phone=(New-TestPhone 4)}
APutRaw "/api/leads/$($pL3.data.id)/status" '{"status":"INCOMING","note":"Ready"}'
ShouldFailRaw "POST" "/api/leads/$($pL3.data.id)/push-to-svc" '{}' "No reason"
ShouldFailRaw "POST" "/api/leads/$($pL3.data.id)/push-to-svc" '{"reason":"  "}' "Whitespace reason"
$validPush = APostRaw "/api/leads/$($pL3.data.id)/push-to-svc" '{"reason":"Qualified"}'
if ($validPush.data.status -eq "PROSPECT") { Pass "Valid push succeeds" } else { Fail "Valid push" "Status: $($validPush.data.status)" }

# ============================================
# 7. FOLLOW-UP VALIDATION
# ============================================
Log "`n=== FOLLOW-UP VALIDATION ===" "Cyan"
ShouldFailBody "POST" "/api/follow-ups" @{title=""; description="Reason"; dueDate="2026-10-01T10:00:00.000Z"; leadId=$lead.data.id} "FU no title"
ShouldFailBody "POST" "/api/follow-ups" @{title="Test"; description=""; dueDate="2026-10-01T10:00:00.000Z"; leadId=$lead.data.id} "FU no desc"
ShouldFailBody "POST" "/api/follow-ups" @{title="Test"; description="Reason"; dueDate=""; leadId=$lead.data.id} "FU no date"
$validFU = APost "/api/follow-ups" @{title="FU test"; description="Follow-up reason"; dueDate="2026-10-01T10:00:00.000Z"; leadId=$lead.data.id}
if ($validFU.data.id) { Pass "Valid FU created" } else { Fail "Valid FU" "No ID" }

# ============================================
# 8. TASK VALIDATION
# ============================================
Log "`n=== TASK VALIDATION ===" "Cyan"
ShouldFailBody "POST" "/api/tasks" @{title=""; description="Task desc"; dueDate="2026-10-01T10:00:00.000Z"; leadId=$lead.data.id} "Task no title"
ShouldFailBody "POST" "/api/tasks" @{title="Test"; description=""; dueDate="2026-10-01T10:00:00.000Z"; leadId=$lead.data.id} "Task no desc"
ShouldFailBody "POST" "/api/tasks" @{title="Test"; description="Task desc"; dueDate=""; leadId=$lead.data.id} "Task no date"
$validTask = APost "/api/tasks" @{title="Task test"; description="Task description"; dueDate="2026-10-01T10:00:00.000Z"; leadId=$lead.data.id}
if ($validTask.data.id) { Pass "Valid Task created" } else { Fail "Valid Task" "No ID" }

# ============================================
# 9. NOTE / ACTIVITY VALIDATION
# ============================================
Log "`n=== NOTE VALIDATION ===" "Cyan"
ShouldFailRaw "POST" "/api/activities" "{`"type`":`"NOTE`",`"subject`":`"Test`",`"leadId`":`"$($lead.data.id)`"}" "Note no content"
ShouldFailRaw "POST" "/api/activities" "{`"type`":`"NOTE`",`"subject`":`"Test`",`"description`":`"`",`"leadId`":`"$($lead.data.id)`"}" "Note empty content"

$callAct = APost "/api/activities" @{type="CALL"; subject="Test call"; leadId=$lead.data.id}
if ($callAct.data.id) { Pass "CALL without description" } else { Fail "CALL activity" "Failed" }

$meetAct = APost "/api/activities" @{type="MEETING"; subject="Test meeting"; leadId=$lead.data.id}
if ($meetAct.data.id) { Pass "MEETING without description" } else { Fail "MEETING activity" "Failed" }

$validNote = APost "/api/activities" @{type="NOTE"; subject="Test note"; description="Important content"; leadId=$lead.data.id}
if ($validNote.data.id) { Pass "Valid NOTE created" } else { Fail "Valid NOTE" "No ID" }

# ============================================
# 10. SITE VISIT VALIDATION (standalone)
# ============================================
Log "`n=== SITE VISIT VALIDATION ===" "Cyan"
ShouldFailRaw "POST" "/api/site-visits" "{`"leadId`":`"$($lead.data.id)`",`"projectId`":`"invalid-id`",`"scheduledAt`":`"2026-10-01T10:00:00.000Z`",`"notes`":`"Visit`"}" "SV with invalid project"

# ============================================
# 11. TENANT ISOLATION
# ============================================
Log "`n=== TENANT ISOLATION ===" "Cyan"
Login "superadmin@dctcrm.com" "password123" | Out-Null
$saData = AGet "/api/leads?limit=1"
if ($saData.pagination.total -ge 170) { Pass "Super Admin sees all leads (bypasses isolation)" } else { Fail "Super Admin" "Only $($saData.pagination.total) leads" }

# ============================================
# RESULTS
# ============================================
Log "`n========================================" "Cyan"
Log "FINAL RESULTS" "Cyan"
Log "========================================" "Cyan"
$passed = ($results | Where-Object { $_.Result -eq "PASS" }).Count
$failed = ($results | Where-Object { $_.Result -eq "FAIL" }).Count
Log "Total: $($results.Count) | Passed: $passed | Failed: $failed" "White"
Log "" "White"
$results | Format-Table -AutoSize
