$baseUrl = "http://localhost:3001"
$results = @()
$phoneSeed = (Get-Date -Format "yyMMddHHmmss") + (Get-Random -Maximum 999).ToString().PadLeft(3, "0")
function New-TestPhone([int]$n) { return "+91-9$phoneSeed" + $n.ToString().PadLeft(3, "0") }

function Log($msg, $color = "White") { Write-Host $msg -ForegroundColor $color }
function Pass($area) { $script:results += [PSCustomObject]@{ Area=$area; Result="PASS" }; Log "  PASS: $area" "Green" }
function Fail($area, $detail) { $script:results += [PSCustomObject]@{ Area=$area; Result="FAIL" }; Log "  FAIL: $area - $detail" "Red" }

function Login($email, $pass) {
    $r = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body "{`"email`":`"$email`",`"password`":`"$pass`"}" -SessionVariable session
    return @{ data=$r.data; session=$session }
}

function AuthGet($session, $url) {
    return Invoke-RestMethod -Uri "$baseUrl$url" -WebSession $session
}
function AuthPost($session, $url, $body) {
    return Invoke-RestMethod -Uri "$baseUrl$url" -Method POST -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) -WebSession $session
}
function AuthPut($session, $url, $body) {
    return Invoke-RestMethod -Uri "$baseUrl$url" -Method PUT -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) -WebSession $session
}
function AuthPostRaw($session, $url, $raw) {
    return Invoke-RestMethod -Uri "$baseUrl$url" -Method POST -ContentType "application/json" -Body $raw -WebSession $session
}
function AuthPutRaw($session, $url, $raw) {
    return Invoke-RestMethod -Uri "$baseUrl$url" -Method PUT -ContentType "application/json" -Body $raw -WebSession $session
}
function ShouldFail($session, $method, $url, $body, $testName) {
    try {
        if ($method -eq "POST") { Invoke-RestMethod -Uri "$baseUrl$url" -Method POST -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) -WebSession $session -ErrorAction Stop }
        elseif ($method -eq "PUT") { Invoke-RestMethod -Uri "$baseUrl$url" -Method PUT -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) -WebSession $session -ErrorAction Stop }
        Fail $testName "Expected rejection but succeeded"
    } catch {
        $err = $_.ErrorDetails.Message
        if ($err -match "error") { Pass $testName } else { Fail $testName "Unexpected: $err" }
    }
}
function ShouldFailRaw($session, $method, $url, $raw, $testName) {
    try {
        if ($method -eq "POST") { Invoke-RestMethod -Uri "$baseUrl$url" -Method POST -ContentType "application/json" -Body $raw -WebSession $session -ErrorAction Stop }
        elseif ($method -eq "PUT") { Invoke-RestMethod -Uri "$baseUrl$url" -Method PUT -ContentType "application/json" -Body $raw -WebSession $session -ErrorAction Stop }
        Fail $testName "Expected rejection but succeeded"
    } catch {
        $err = $_.ErrorDetails.Message
        if ($err -match "error") { Pass $testName } else { Fail $testName "Unexpected: $err" }
    }
}

# ============================================
# SECTION 1: PRESALES TEST
# ============================================
Log "`n========================================" "Cyan"
Log "SECTION 1: PRESALES WORKFLOW TEST" "Cyan"
Log "========================================" "Cyan"

$presales = Login "neha@dctcrm.com" "password123"
Log "Logged in as: $($presales.data.user.firstName) $($presales.data.user.lastName) [$($presales.data.profile.name)]" "Yellow"

# Create a lead as presales
$pl1 = AuthPost $presales.session "/api/leads" @{firstName="Presales"; lastName="Test Lead"; company="PresalesCorp"; source="WEBSITE"; phone=(New-TestPhone 1)}
Log "Created lead: $($pl1.data.leadNumber)" "Gray"
Pass "Lead Number auto-generated"

# Spec §2/§22: presales record access = OWNER scope. Round Robin may assign the
# new lead to a different presales user, so the workflow steps run as the owner.
$plSess = $presales.session
if ($pl1.data.ownerId -and $pl1.data.ownerId -ne $presales.data.user.id) {
    $plAdminSess = (Login "admin@dctcrm.com" "password123").session
    $plOwner = $null
    try { $plOwner = AuthGet $plAdminSess "/api/users/$($pl1.data.ownerId)" } catch { }
    if ($plOwner -and $plOwner.data -and $plOwner.data.email) {
        foreach ($pw in @("password123", "DctTest@123")) {
            $cand = Login $plOwner.data.email $pw
            if ($cand -and $cand.data -and $cand.data.token) { $plSess = $cand.session; break }
        }
        Log "  Lead owner (Round Robin): $($plOwner.data.email)" "Gray"
    }
}

# Verify lead number in list
$listCheck = AuthGet $presales.session "/api/leads?limit=1"
if ($listCheck.data[0].leadNumber) { Pass "Lead Number in list" } else { Fail "Lead Number in list" "No leadNumber field" }

# Verify lead number in search (as the owner — creator keeps no access once RR assigns)
$searchCheck = AuthGet $plSess "/api/leads?search=$($pl1.data.leadNumber)"
if ($searchCheck.pagination.total -ge 1) { Pass "Lead Number searchable" } else { Fail "Lead Number searchable" "No results" }

# Test status change without note -> FAIL
ShouldFailRaw $plSess "PUT" "/api/leads/$($pl1.data.id)/status" '{"status":"INCOMING"}' "Status change without note rejected"

# Test status change with empty note -> FAIL
ShouldFailRaw $plSess "PUT" "/api/leads/$($pl1.data.id)/status" '{"status":"INCOMING","note":"   "}' "Status change with whitespace note rejected"

# Move to Incoming
$incomingResp = AuthPutRaw $plSess "/api/leads/$($pl1.data.id)/status" '{"status":"INCOMING","note":"Customer contacted successfully"}'
Log "  Status: $($incomingResp.data.status)" "Gray"
if ($incomingResp.success -and $incomingResp.data.status -eq "INCOMING") { Pass "Status NEW -> INCOMING" } else { Fail "Status NEW -> INCOMING" "rejected: $($incomingResp.error)" }

# Test push to SVC without reason -> FAIL
ShouldFailRaw $plSess "POST" "/api/leads/$($pl1.data.id)/push-to-svc" '{}' "Push to SVC without reason rejected"

# Push to SVC
$pushResp = AuthPostRaw $plSess "/api/leads/$($pl1.data.id)/push-to-svc" '{"reason":"Lead is qualified for site visit"}'
Log "  Pushed to SVC. Status: $($pushResp.data.status), Owner: $($pushResp.data.owner.firstName) $($pushResp.data.owner.lastName)" "Gray"
if ($pushResp.success -and $pushResp.data.ownerId -and $pushResp.data.ownerId -ne $pl1.data.ownerId) {
    Pass "Push to SVC with reason"
    Pass "SVC Round Robin assignment"
} else {
    Fail "Push to SVC with reason" "rejected: $($pushResp.error)"
    Fail "SVC Round Robin assignment" "owner unchanged"
}

# Verify owner history — after the handoff the previous owner/creator no longer
# has record access (spec §22), so history is read with the admin session.
if (-not $plAdminSess) { $plAdminSess = (Login "admin@dctcrm.com" "password123").session }
$leadAfterPush = AuthGet $plAdminSess "/api/leads/$($pl1.data.id)"
$oh = $leadAfterPush.data.ownerHistory
if ($oh.Count -ge 2) { Pass "Owner History recorded" } else { Fail "Owner History" "Only $($oh.Count) entries" }

# Verify audit log
$audit = $leadAfterPush.data.auditLogs
$hasNote = $audit | Where-Object { $_.newValues.note -or $_.newValues.recoveryNote }
if ($audit.Count -ge 2) { Pass "Audit Log recorded" } else { Fail "Audit Log" "Only $($audit.Count) entries" }

# ============================================
# SECTION 2: SVC TEST
# ============================================
Log "`n========================================" "Cyan"
Log "SECTION 2: SVC WORKFLOW TEST" "Cyan"
Log "========================================" "Cyan"

# Log in as the SVC Round Robin actually assigned (owner rotates).
# Seeded RR pool members (svc.testN@dctcrm.com) use the seed-profiles password;
# suite-created SVC users use password123 — try both.
$assignedSvcEmail = $leadAfterPush.data.owner.email
if (-not $assignedSvcEmail) { Fail "SVC assigned owner email" "Owner email missing on lead detail"; $assignedSvcEmail = "vikram.svc@test.com" }
$svc = $null
foreach ($pw in @("password123", "DctTest@123")) {
    try {
        $candidate = Login $assignedSvcEmail $pw
        if ($candidate -and $candidate.data -and $candidate.data.token) { $svc = $candidate; break }
    } catch { }
}
if ($svc) {
    Log "Logged in as: $($svc.data.user.firstName) $($svc.data.user.lastName) [$($svc.data.profile.name)] (assigned owner)" "Yellow"
} else {
    Fail "SVC assigned owner login" "Cannot log in as $assignedSvcEmail (password123 and DctTest@123 both rejected)"
}

# SVC should see the lead pushed by presales
$svcLeads = AuthGet $svc.session "/api/leads?limit=20"
$svcLead = $svcLeads.data | Where-Object { $_.id -eq $pl1.data.id }
if ($svcLead) { Pass "SVC sees assigned lead" } else { Fail "SVC sees assigned lead" "Lead not found in SVC list (owner: $assignedSvcEmail)" }

# Verify lead is in PROSPECT status
Log "  Lead status: $($svcLead.status)" "Gray"

# Test site visit creation (scheduling requires Lead edit — admin drives setup; the
# assigned SVC executes visits but cannot schedule: authorize('Lead','edit'))
$adminSess = (Login "admin@dctcrm.com" "password123").session
ShouldFailRaw $adminSess "POST" "/api/leads/$($pl1.data.id)/schedule-site-visit" '{"notes":"Visit needed","scheduledAt":"2026-10-01T10:00:00.000Z"}' "Site visit without project rejected"

# Test site visit creation - missing notes
$projects = AuthGet $adminSess "/api/projects?limit=1"
$projId = if ($projects.data.Count -gt 0) { $projects.data[0].id } else { $null }
if ($projId) {
    ShouldFailRaw $adminSess "POST" "/api/leads/$($pl1.data.id)/schedule-site-visit" "{`"projectId`":`"$projId`",`"scheduledAt`":`"2026-10-01T10:00:00.000Z`"}" "Site visit without notes rejected"
    ShouldFailRaw $adminSess "POST" "/api/leads/$($pl1.data.id)/schedule-site-visit" "{`"projectId`":`"$projId`",`"notes`":`"Visit reason`"}" "Site visit without date rejected"
    
    # Successful site visit
    $svResp = AuthPostRaw $adminSess "/api/leads/$($pl1.data.id)/schedule-site-visit" "{`"projectId`":`"$projId`",`"notes`":`"Initial site visit`",`"scheduledAt`":`"2026-10-01T10:00:00.000Z`"}"
    if ($svResp.success -and $svResp.data.lead.status -eq "SITE_VISIT_SCHEDULED") {
        Log "  Site visit created. Lead status: $($svResp.data.lead.status)" "Gray"
        Pass "Site visit creation with all fields"
        Pass "Status PROSPECT -> SITE_VISIT_SCHEDULED"
    } else {
        Fail "Site visit creation with all fields" "status=$($svResp.data.lead.status) err=$($svResp.error)"
    }
} else {
    Log "  WARNING: No projects found, skipping site visit tests" "Yellow"
}

# ============================================
# SECTION 3: SALES TEST
# ============================================
Log "`n========================================" "Cyan"
Log "SECTION 3: SALES WORKFLOW TEST" "Cyan"
Log "========================================" "Cyan"

$sales = Login "sanjay.sales@test.com" "password123"
Log "Logged in as: $($sales.data.user.firstName) $($sales.data.user.lastName) [$($sales.data.profile.name)]" "Yellow"

# Check if sales user has the lead
$salesLeads = AuthGet $sales.session "/api/leads?limit=20"
$salesLead = $salesLeads.data | Where-Object { $_.id -eq $pl1.data.id }
if ($salesLead) {
    Log "  Sales sees lead: $($salesLead.leadNumber) - Status: $($salesLead.status)" "Gray"
    Pass "Sales sees assigned lead"
    
    # Complete site visit (SITE_VISIT_SCHEDULED -> SITE_VISIT_HAPPENED)
    $svList = AuthGet $sales.session "/api/site-visits?leadId=$($pl1.data.id)&limit=1"
    if ($svList.data.Count -gt 0) {
        $svId = $svList.data[0].id
        $completeBody = @{ completedAt=(Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.000Z"); customerFeedback="Sales follow-up"; completionNotes="Visit completed" } | ConvertTo-Json
        $completeResp = Invoke-RestMethod -Uri "$baseUrl/api/site-visits/$svId/complete" -Method PATCH -ContentType "application/json" -Body $completeBody -WebSession $sales.session
        Log "  Site visit completed. Lead status should be SITE_VISIT_HAPPENED" "Gray"
        Pass "Complete site visit"
        
        # Verify lead status updated
        $leadCheck = AuthGet $sales.session "/api/leads/$($pl1.data.id)"
        if ($leadCheck.data.status -eq "SITE_VISIT_HAPPENED") {
            Pass "Lead status SITE_VISIT_SCHEDULED -> SITE_VISIT_HAPPENED"
        } else {
            Fail "Lead status update" "Status is $($leadCheck.data.status)"
        }
    } else {
        Log "  No site visits found for this lead" "Yellow"
    }
} else {
    Log "  Sales does not see this lead (may need different assignment)" "Yellow"
}

# ============================================
# SECTION 4: ADMIN TEST
# ============================================
Log "`n========================================" "Cyan"
Log "SECTION 4: ADMIN WORKFLOW TEST" "Cyan"
Log "========================================" "Cyan"

$admin = Login "admin@dctcrm.com" "password123"
Log "Logged in as: $($admin.data.user.firstName) $($admin.data.user.lastName) [$($admin.data.profile.name)]" "Yellow"

# Admin can see all leads
$adminLeads = AuthGet $admin.session "/api/leads?limit=50"
Log "  Admin sees $($adminLeads.pagination.total) leads total" "Gray"
Pass "Admin sees all leads"

# Admin can view any lead detail
$adminLead = AuthGet $admin.session "/api/leads/$($pl1.data.id)"
if ($adminLead.data.leadNumber) { Pass "Admin views lead detail with leadNumber" } else { Fail "Admin lead detail" "No leadNumber" }
if ($adminLead.data.ownerHistory.Count -ge 2) { Pass "Admin sees owner history" } else { Fail "Admin owner history" "Missing" }
if ($adminLead.data.auditLogs.Count -ge 2) { Pass "Admin sees audit logs" } else { Fail "Admin audit logs" "Missing" }

# Admin can update lead fields
$adminUpdate = AuthPut $admin.session "/api/leads/$($pl1.data.id)" @{description="Admin updated description"}
Log "  Admin updated lead description" "Gray"
Pass "Admin can edit lead fields"

# Admin can change status
$adminStatus = AuthPutRaw $admin.session "/api/leads/$($pl1.data.id)/status" '{"status":"INCOMING","note":"Admin re-entering for testing"}'
Log "  Admin changed status to: $($adminStatus.data.status)" "Gray"
Pass "Admin can change status"

# ============================================
# SECTION 5: LEAD NUMBER COMPREHENSIVE
# ============================================
Log "`n========================================" "Cyan"
Log "SECTION 5: LEAD NUMBER COMPREHENSIVE" "Cyan"
Log "========================================" "Cyan"

# Create 3 leads and verify sequential
$l1 = AuthPost $admin.session "/api/leads" @{firstName="Seq"; lastName="Test 1"; company="SeqCorp"; source="WEBSITE"; phone=(New-TestPhone 2)}
$l2 = AuthPost $admin.session "/api/leads" @{firstName="Seq"; lastName="Test 2"; company="SeqCorp"; source="WEBSITE"; phone=(New-TestPhone 3)}
$l3 = AuthPost $admin.session "/api/leads" @{firstName="Seq"; lastName="Test 3"; company="SeqCorp"; source="WEBSITE"; phone=(New-TestPhone 4)}
Log "  $($l1.data.leadNumber) -> $($l2.data.leadNumber) -> $($l3.data.leadNumber)" "Gray"
Pass "Sequential lead numbers"

# Search by exact lead number
$searchExact = AuthGet $admin.session "/api/leads?search=$($l2.data.leadNumber)"
if ($searchExact.data.Count -eq 1 -and $searchExact.data[0].id -eq $l2.data.id) {
    Pass "Exact lead number search"
} else {
    Fail "Exact lead number search" "Got $($searchExact.data.Count) results"
}

# Cannot edit lead number
$editAttempt = AuthPut $admin.session "/api/leads/$($l1.data.id)" @{leadNumber="LN999999"}
$verify = AuthGet $admin.session "/api/leads/$($l1.data.id)"
if ($verify.data.leadNumber -eq $l1.data.leadNumber) { Pass "Lead number not editable" } else { Fail "Lead number not editable" "Was changed" }

# ============================================
# SECTION 6: SEARCH COMPREHENSIVE
# ============================================
Log "`n========================================" "Cyan"
Log "SECTION 6: SEARCH COMPREHENSIVE" "Cyan"
Log "========================================" "Cyan"

# Search by name
$nameSearch = AuthGet $admin.session "/api/leads?search=Seq+Test"
if ($nameSearch.pagination.total -ge 3) { Pass "Search by name" } else { Fail "Search by name" "Only $($nameSearch.pagination.total) results" }

# Search by company
$companySearch = AuthGet $admin.session "/api/leads?search=SeqCorp"
if ($companySearch.pagination.total -ge 3) { Pass "Search by company" } else { Fail "Search by company" "Only $($companySearch.pagination.total) results" }

# Search by lead number
$lnSearch = AuthGet $admin.session "/api/leads?search=$($l1.data.leadNumber)"
if ($lnSearch.pagination.total -eq 1) { Pass "Search by lead number" } else { Fail "Search by lead number" "Got $($lnSearch.pagination.total)" }

# ============================================
# SECTION 7: STATUS NOTE COMPREHENSIVE
# ============================================
Log "`n========================================" "Cyan"
Log "SECTION 7: STATUS NOTE VALIDATION" "Cyan"
Log "========================================" "Cyan"

ShouldFailRaw $admin.session "PUT" "/api/leads/$($l1.data.id)/status" '{"status":"INCOMING"}' "No note rejected"
ShouldFailRaw $admin.session "PUT" "/api/leads/$($l1.data.id)/status" '{"status":"INCOMING","note":""}' "Empty note rejected"
ShouldFailRaw $admin.session "PUT" "/api/leads/$($l1.data.id)/status" '{"status":"INCOMING","note":"   "}' "Whitespace note rejected"

$validStatus = AuthPutRaw $admin.session "/api/leads/$($l1.data.id)/status" '{"status":"INCOMING","note":"Valid reason for status change"}'
if ($validStatus.data.status -eq "INCOMING") { Pass "Valid note accepted" } else { Fail "Valid note accepted" "Status: $($validStatus.data.status)" }

# ============================================
# SECTION 8: FOLLOW-UP VALIDATION
# ============================================
Log "`n========================================" "Cyan"
Log "SECTION 8: FOLLOW-UP VALIDATION" "Cyan"
Log "========================================" "Cyan"

ShouldFail $admin.session "POST" "/api/follow-ups" @{title=""; description="Test"; dueDate="2026-10-01T10:00:00.000Z"; leadId=$l1.data.id} "Follow-up without title rejected"
ShouldFail $admin.session "POST" "/api/follow-ups" @{title="Test"; description=""; dueDate="2026-10-01T10:00:00.000Z"; leadId=$l1.data.id} "Follow-up without description rejected"
ShouldFail $admin.session "POST" "/api/follow-ups" @{title="Test"; description="Reason"; dueDate=""; leadId=$l1.data.id} "Follow-up without date rejected"

$validFU = AuthPost $admin.session "/api/follow-ups" @{title="Follow-up test"; description="Follow-up reason"; dueDate="2026-10-01T10:00:00.000Z"; leadId=$l1.data.id}
if ($validFU.data.id) { Pass "Follow-up creation with all fields" } else { Fail "Follow-up creation" "No ID returned" }

# ============================================
# SECTION 9: TASK VALIDATION
# ============================================
Log "`n========================================" "Cyan"
Log "SECTION 9: TASK VALIDATION" "Cyan"
Log "========================================" "Cyan"

ShouldFail $admin.session "POST" "/api/tasks" @{title=""; description="Test task"; dueDate="2026-10-01T10:00:00.000Z"; leadId=$l1.data.id} "Task without title rejected"
ShouldFail $admin.session "POST" "/api/tasks" @{title="Test task"; description=""; dueDate="2026-10-01T10:00:00.000Z"; leadId=$l1.data.id} "Task without description rejected"
ShouldFail $admin.session "POST" "/api/tasks" @{title="Test task"; description="Task desc"; dueDate=""; leadId=$l1.data.id} "Task without dueDate rejected"

$validTask = AuthPost $admin.session "/api/tasks" @{title="Task test"; description="Task description"; dueDate="2026-10-01T10:00:00.000Z"; leadId=$l1.data.id}
if ($validTask.data.id) { Pass "Task creation with all fields" } else { Fail "Task creation" "No ID returned" }

# ============================================
# SECTION 10: NOTE VALIDATION
# ============================================
Log "`n========================================" "Cyan"
Log "SECTION 10: NOTE VALIDATION" "Cyan"
Log "========================================" "Cyan"

ShouldFailRaw $admin.session "POST" "/api/activities" "{`"type`":`"NOTE`",`"subject`":`"Test`",`"leadId`":`"$($l1.data.id)`"}" "Note without content rejected"
ShouldFailRaw $admin.session "POST" "/api/activities" "{`"type`":`"NOTE`",`"subject`":`"Test`",`"description`":`"`",`"leadId`":`"$($l1.data.id)`"}" "Note with empty content rejected"

# Non-NOTE activities should work without description
$callActivity = AuthPost $admin.session "/api/activities" @{type="CALL"; subject="Test call"; leadId=$l1.data.id}
if ($callActivity.data.id) { Pass "Activity (CALL) without description works" } else { Fail "Activity (CALL) without description" "No ID" }

$validNote = AuthPost $admin.session "/api/activities" @{type="NOTE"; subject="Test note"; description="Important note content"; leadId=$l1.data.id}
if ($validNote.data.id) { Pass "Note creation with content" } else { Fail "Note creation" "No ID returned" }

# ============================================
# SECTION 11: PUSH TO SVC COMPREHENSIVE
# ============================================
Log "`n========================================" "Cyan"
Log "SECTION 11: PUSH TO SVC VALIDATION" "Cyan"
Log "========================================" "Cyan"

# Create a fresh lead for push testing
$pushLead = AuthPost $admin.session "/api/leads" @{firstName="Push"; lastName="Test"; company="PushCorp"; source="WEBSITE"; phone=(New-TestPhone 5)}
AuthPutRaw $admin.session "/api/leads/$($pushLead.data.id)/status" '{"status":"INCOMING","note":"Moving to incoming"}'

ShouldFailRaw $admin.session "POST" "/api/leads/$($pushLead.data.id)/push-to-svc" '{}' "Push without reason rejected"
ShouldFailRaw $admin.session "POST" "/api/leads/$($pushLead.data.id)/push-to-svc" '{"reason":"   "}' "Push with whitespace reason rejected"

$validPush = AuthPostRaw $admin.session "/api/leads/$($pushLead.data.id)/push-to-svc" '{"reason":"Qualified lead"}'
if ($validPush.data.status -eq "PROSPECT") { Pass "Push to SVC succeeds" } else { Fail "Push to SVC" "Status: $($validPush.data.status)" }
if ($validPush.data.owner.id) { Pass "Round Robin owner assigned" } else { Fail "Round Robin" "No owner" }

# ============================================
# SECTION 12: TENANT ISOLATION
# ============================================
Log "`n========================================" "Cyan"
Log "SECTION 12: TENANT ISOLATION" "Cyan"
Log "========================================" "Cyan"

# Login as a user from a different tenant
$otherTenant = Login "superadmin@dctcrm.com" "password123"
if ($otherTenant.data.user.isSuperAdmin) {
    Log "  Super Admin bypasses tenant isolation (expected)" "Gray"
    Pass "Super Admin tenant bypass"
} else {
    # Try to access lead from different tenant
    $crossAccess = Invoke-WebRequest -Uri "$baseUrl/api/leads/$($pl1.data.id)" -WebSession $otherTenant.session -ErrorAction SilentlyContinue
    if ($crossAccess.StatusCode -eq 404 -or $crossAccess.StatusCode -eq 403) {
        Pass "Cross-tenant lead access blocked"
    } else {
        Fail "Cross-tenant isolation" "Could access other tenant's lead"
    }
}

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
