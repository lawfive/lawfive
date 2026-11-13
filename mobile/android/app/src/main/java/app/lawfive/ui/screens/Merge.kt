package app.lawfive.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.lawfive.data.ApiException
import app.lawfive.data.MergeKind
import app.lawfive.schema.DuplicateMember
import app.lawfive.schema.MatchCount
import app.lawfive.schema.RefereeMergeDraft
import app.lawfive.schema.RefereeMergePreview
import app.lawfive.schema.VenueMergeDraft
import app.lawfive.schema.VenueMergeDraftPitchesItem
import app.lawfive.schema.VenueMergePreview
import app.lawfive.schema.VenueMergePreviewPitchesItem
import app.lawfive.schema.VenueMergePreviewPitchesItemChoice
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.LocalNav
import app.lawfive.ui.components.Avatar
import app.lawfive.ui.components.Chip
import app.lawfive.ui.components.ChipTone
import app.lawfive.ui.components.Choice
import app.lawfive.ui.components.EmptyPicture
import app.lawfive.ui.components.EmptyState
import app.lawfive.ui.components.Field
import app.lawfive.ui.components.Gap
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.ListRow
import app.lawfive.ui.components.LoadingPitch
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.PrimaryButton
import app.lawfive.ui.components.Screen
import app.lawfive.ui.components.SearchChoice
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.components.SectionTitle
import app.lawfive.ui.describeCount
import app.lawfive.ui.theme.colors
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// Finding duplicates and merging them on the phone (DUP-12), as on the website: Find duplicates on
// the Venues and Referees lists, and Merge with… on a venue's or referee's edit page. A merge takes
// two steps: pick the ones that are the same, then review what the merged one will be (for venues,
// every pitch) with Merge at the bottom. The server works all of it out (DUP-11) and the phone only
// shows it, so it needs a connection; the preview is asked for again as the choices change.

/** The words that differ between venues and referees. */
private class Words(val one: String, val many: String, val who: String, val same: String, val notSame: String, val notSameMany: String, val picture: EmptyPicture)

private val MergeKind.words
    get() = when (this) {
        MergeKind.Venues -> Words("venue", "venues", "that", "the same place", "Not the same venue", "Not the same venues", EmptyPicture.Venue)
        MergeKind.Referees -> Words("referee", "referees", "who", "the same person", "Not the same person", "Not the same people", EmptyPicture.Crew)
    }

private fun count(c: MatchCount) = describeCount(app.lawfive.ui.MatchCount(c.played.toInt(), c.upcoming.toInt()))

/** The line under a name: its matches first (APP-19), then other names and details. */
private fun memberLine(m: DuplicateMember): String = listOfNotNull(
    count(m.matches),
    m.aliases.takeIf { it.isNotEmpty() }?.let { "Also ${it.joinToString(", ")}" },
    m.address, m.pitches?.takeIf { it > 0 }?.let { "$it ${if (it == 1L) "pitch" else "pitches"}" },
    m.email, m.phone,
).joinToString(" · ")

private fun failure(e: Throwable): String =
    if (e is ApiException && e.status != 0) e.message ?: "The server couldn't do that" else "LawFive's server finds duplicates and merges them, so this needs a connection."

/** Offline, or the server didn't answer: nothing is worked out on the phone. */
@Composable
private fun NeedsConnection(message: String, retry: () -> Unit) {
    LfCard {
        EmptyState(EmptyPicture.Center, "Merging needs a connection", message) { SecondaryButton("Try again", retry, icon = Ph.Sync) }
    }
}

/** Find duplicates: groups that are probably one, with why; merge a group, or say they aren't the same (DUP-1, DUP-5, DUP-7). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DuplicatesScreen(kind: MergeKind) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val w = kind.words
    var groups by remember { mutableStateOf<app.lawfive.schema.DuplicateGroups?>(null) }
    var failed by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    // Again on coming back from a merge, so a group merged has gone.
    LaunchedEffect(attempt) {
        failed = null
        runCatching { graph.merging.duplicates(kind) }.onSuccess { groups = it }.onFailure { if (it is CancellationException) throw it; failed = failure(it) }
    }
    val pictures = if (kind == MergeKind.Referees) rememberRefereePictures() else emptyMap()
    val referees by graph.records.referees.collectAsStateWithLifecycle(emptyList())
    Screen(
        "Duplicate ${w.many}", back = w.many.replaceFirstChar { it.uppercase() },
        sub = if (kind == MergeKind.Venues) "Probably the same place under different names, at the same address, or within 150 m. Merging keeps their matches together."
        else "Probably the same person under different names (Doe, John and John Doe), or with the same email or phone. Merging keeps their matches together.",
    ) {
        val found = groups
        when {
            failed != null && found == null -> item { NeedsConnection(failed!!) { attempt++ } }
            found == null -> item { LfCard { LoadingPitch() } }
            found.groups.isEmpty() -> item {
                LfCard {
                    EmptyState(w.picture, "No likely duplicates", "None of your ${found.of} ${w.many} look like ${w.same}. To merge two anyway, open one, choose Edit, then Merge with…")
                }
            }
            else -> found.groups.forEach { group ->
                item(key = group.members.joinToString { it.id }) {
                    LfCard {
                        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 6.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Probably ${w.same}", style = MaterialTheme.typography.titleSmall)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                group.reasons.forEach { Chip(it, ChipTone.Blue) }
                            }
                        }
                        group.members.forEach { m ->
                            ListRow(
                                m.name, memberLine(m),
                                leading = { MemberAvatar(kind, m.id, m.name, referees, pictures) },
                                onClick = { nav.navigate(if (kind == MergeKind.Venues) "venue/${m.id}" else "referee/${m.id}") },
                            )
                        }
                        HorizontalDivider(color = colors.border, thickness = 1.dp)
                        ButtonPair(halves = false, Modifier.padding(12.dp)) {
                            SecondaryButton(if (group.members.size == 2) w.notSame else w.notSameMany, {
                                scope.launch {
                                    busy = true
                                    runCatching { graph.merging.notTheSame(kind, group.members.map { it.id }) }
                                        .onSuccess { graph.requestSync(); attempt++ }.onFailure { failed = failure(it) }
                                    busy = false
                                }
                            }, enabled = !busy)
                            PrimaryButton("Merge…", { nav.navigate(mergeRoute(kind, group.members.first().id, group.members.drop(1).map { it.id })) }, icon = Ph.Merge)
                        }
                    }
                    Gap()
                }
            }
        }
        if (failed != null && groups != null) item { Text(failed!!, color = colors.redText, style = MaterialTheme.typography.bodySmall) }
    }
}

/**
 * The server's likely duplicates (DUP-13): the last answer at once, asked again after each sync;
 * none offline, or from a server without merging.
 */
@Composable
private fun rememberDuplicates(kind: MergeKind): app.lawfive.schema.DuplicateGroups? {
    val graph = LocalGraph.current
    val status by graph.sync.status.collectAsStateWithLifecycle()
    return androidx.compose.runtime.produceState(graph.merging.kept(kind), status.running) {
        if (!status.running && graph.mergingOffered()) runCatching { graph.merging.duplicates(kind) }.onSuccess { value = it }
    }.value
}

/** Over the Venues or Referees list: "2 venues look like duplicates", opening Find duplicates (DUP-13). */
@Composable
fun DuplicatesNotice(kind: MergeKind) {
    val nav = LocalNav.current
    val count = rememberDuplicates(kind)?.groups?.sumOf { it.members.size } ?: 0
    if (count == 0) return
    Row(
        Modifier.padding(bottom = 12.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(colors.blueSoft)
            .clickable { nav.navigate("${kind.collection}/duplicates") }.padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        PhIcon(Ph.Merge, size = 18.dp)
        Text("$count ${kind.words.many} look like duplicates", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Text("Review", style = MaterialTheme.typography.labelLarge, color = colors.text)
        PhIcon(Ph.Next, size = 16.dp, tint = colors.muted)
    }
}

/**
 * Not the same and Merge… side by side, or one above the other at full width when their words don't
 * fit side by side (the phone's larger text sizes), rather than cut short. [halves] gives each half
 * the row; otherwise they keep their own widths at its end.
 */
@Composable
private fun ButtonPair(halves: Boolean, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    androidx.compose.ui.layout.Layout(content, modifier.fillMaxWidth()) { measurables, constraints ->
        val gap = 10.dp.roundToPx()
        val width = constraints.maxWidth
        val wants = measurables.map { it.maxIntrinsicWidth(androidx.compose.ui.unit.Constraints.Infinity) }
        val half = (width - gap) / 2
        if (if (halves) wants.all { it <= half } else wants.sum() + gap * (wants.size - 1) <= width) {
            val placed = measurables.mapIndexed { i, m -> m.measure(androidx.compose.ui.unit.Constraints.fixedWidth(if (halves) half else wants[i])) }
            val height = placed.maxOf { it.height }
            layout(width, height) {
                var x = width - placed.sumOf { it.width } - gap * (placed.size - 1)
                placed.forEach { it.placeRelative(x, (height - it.height) / 2); x += it.width + gap }
            }
        } else {
            val placed = measurables.map { it.measure(androidx.compose.ui.unit.Constraints.fixedWidth(width)) }
            layout(width, placed.sumOf { it.height } + gap * (placed.size - 1)) {
                var y = 0
                placed.forEach { it.placeRelative(0, y); y += it.height + gap }
            }
        }
    }
}

/** On a venue's or referee's page: the ones it's probably the same as, with why, Not the same and Merge… (DUP-13). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DuplicateCard(kind: MergeKind, id: String) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    var done by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    val group = rememberDuplicates(kind)?.groups?.firstOrNull { g -> g.members.any { it.id == id } }
    if (group == null || done) return
    val others = group.members.filter { it.id != id }
    val w = kind.words
    LfCard {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                PhIcon(Ph.Merge, size = 18.dp, tint = colors.brand)
                Text("Probably the same as ${others.joinToString(" and ") { it.name }}", style = MaterialTheme.typography.titleMedium)
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { group.reasons.forEach { Chip(it, ChipTone.Blue) } }
            // Half each, so neither looks like the lesser choice.
            ButtonPair(halves = true) {
                SecondaryButton(if (others.size == 1) w.notSame else w.notSameMany, {
                    scope.launch {
                        busy = true
                        runCatching { graph.merging.notTheSame(kind, group.members.map { it.id }) }.onSuccess { done = true; graph.requestSync() }
                        busy = false
                    }
                }, enabled = !busy)
                PrimaryButton("Merge…", { nav.navigate(mergeRoute(kind, id, others.map { it.id })) }, icon = Ph.Merge)
            }
        }
    }
    Gap()
}

/** Step 1 of a merge: which ones are the same as the one kept. */
fun mergeRoute(kind: MergeKind, keptId: String, with: List<String> = emptyList()) = "${kind.collection}/merge/$keptId?with=${with.joinToString(",")}"

@Composable
private fun MemberAvatar(kind: MergeKind, id: String, name: String, referees: List<app.lawfive.schema.Referee>, pictures: Map<String, app.lawfive.schema.Attachment>) {
    val referee = referees.firstOrNull { it.id == id }
    if (kind == MergeKind.Referees && referee != null) RefereeAvatar(referee, pictures[id]) else if (kind == MergeKind.Referees) Avatar(text = app.lawfive.ui.initials(name)) else Avatar(icon = Ph.Venues)
}

/** The Merge button's bar, fixed at the bottom over the page. */
@Composable
private fun BottomBar(content: @Composable () -> Unit) {
    // A strip of the board along the foot, as a form's Save bar (WEB-24).
    Box(Modifier.fillMaxSize()) { app.lawfive.ui.theme.OnBoard {
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(colors.board).navigationBarsPadding(),
        ) {
            HorizontalDivider(color = if (colors.dark) colors.boardEdge else colors.boardRule, thickness = 1.dp)
            Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { content() }
        }
    } }
}

/** Step 1: the likeliest first, with why, and a search through the rest; Next when one is picked. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MergePickScreen(kind: MergeKind, keptId: String, with: List<String>) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val w = kind.words
    val venues by graph.records.venues.collectAsStateWithLifecycle(emptyList())
    val referees by graph.records.referees.collectAsStateWithLifecycle(emptyList())
    val pictures = if (kind == MergeKind.Referees) rememberRefereePictures() else emptyMap()
    // id, name, a detail and other names, from the phone's own lists, for the search.
    val records = if (kind == MergeKind.Venues) venues.map { listOf(it.id, it.name, it.address ?: "") to (it.aliases ?: emptyList()) }
    else referees.map { listOf(it.id, it.name, it.email ?: it.phone ?: "") to (it.aliases ?: emptyList()) }
    val keptName = records.firstOrNull { it.first[0] == keptId }?.first?.get(1) ?: ""
    var likely by remember { mutableStateOf<List<DuplicateMember>?>(null) }
    var failed by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    LaunchedEffect(attempt) {
        failed = null
        runCatching { graph.merging.likely(kind, keptId) }.onSuccess { likely = it }.onFailure { if (it is CancellationException) throw it; failed = failure(it) }
    }
    var picked by rememberSaveable { mutableStateOf(with.joinToString(",")) }
    val selected = picked.split(",").filter { it.isNotBlank() }
    fun toggle(id: String) { picked = (if (id in selected) selected - id else selected + id).joinToString(",") }
    Box(Modifier.fillMaxSize()) {
        Screen("Merge with $keptName", back = keptName, label = "Pick ${w.many}") {
            item {
                Text(
                    "Pick the ${w.many} ${w.who} are ${w.same} as $keptName. Their matches move to one ${w.one}, and their names are kept as other names, so imports and searches still find them.",
                    style = MaterialTheme.typography.bodyMedium, color = colors.muted,
                )
                Gap(16)
            }
            val found = likely
            when {
                failed != null && found == null -> item { NeedsConnection(failed!!) { attempt++ } }
                found == null -> item { LfCard { LoadingPitch() } }
                else -> {
                    item { SectionTitle(if (found.isEmpty()) "No likely matches; search below" else "Most likely ${w.same}") }
                    // Those found by search, after the likeliest.
                    val rows = found.map { Triple(it.id, it.name, it) } + selected.filter { id -> found.none { it.id == id } }
                        .mapNotNull { id -> records.firstOrNull { it.first[0] == id }?.let { Triple(id, it.first[1], null) } }
                    if (rows.isNotEmpty()) item {
                        LfCard {
                            rows.forEachIndexed { i, (id, name, member) ->
                                if (i > 0) HorizontalDivider(color = colors.border, thickness = 1.dp)
                                Row(
                                    Modifier.fillMaxWidth().clickable { toggle(id) }.padding(start = 6.dp, end = 16.dp, top = 10.dp, bottom = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Checkbox(id in selected, { toggle(id) }, colors = CheckboxDefaults.colors(checkedColor = colors.brand, checkmarkColor = colors.onBrand, uncheckedColor = colors.muted))
                                    MemberAvatar(kind, id, name, referees, pictures)
                                    Column(Modifier.padding(start = 12.dp).weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Text(name, style = MaterialTheme.typography.titleMedium)
                                        val line = member?.let(::memberLine) ?: records.firstOrNull { it.first[0] == id }?.first?.get(2)
                                        if (!line.isNullOrBlank()) Text(line, style = MaterialTheme.typography.bodySmall, color = colors.muted)
                                        member?.reasons?.let { reasons ->
                                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { reasons.forEach { Chip(it, ChipTone.Blue) } }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    item {
                        Gap()
                        SearchChoice(
                            "Another ${w.one}", null, records.filter { it.first[0] != keptId && it.first[0] !in selected }.sortedBy { it.first[1].lowercase() },
                            { it.first[1] }, { it?.let { r -> toggle(r.first[0]) } }, empty = "Search all ${w.many}…", allowNone = false, otherNames = { it.second },
                        )
                    }
                }
            }
            item { Spacer(Modifier.height(110.dp)) }
        }
        BottomBar {
            Text(
                if (selected.isEmpty()) "Pick at least one" else "${selected.size + 1} ${w.many} to merge into one",
                style = MaterialTheme.typography.bodySmall, color = colors.muted,
            )
            PrimaryButton("Next", { nav.navigate("${kind.collection}/merge/$keptId/review?from=${selected.joinToString(",")}") }, Modifier.fillMaxWidth(), icon = Ph.Next, enabled = selected.isNotEmpty())
        }
    }
}

/** A preview for the choices so far: asked again a moment after they change, the newest answer kept (DUP-11). */
private class Preview<P>(val shown: P?, val current: Boolean, val failed: String?, val retry: () -> Unit)

@Composable
private fun <D, P> rememberPreview(draft: D, fetch: suspend (D) -> P): Preview<P> {
    var answer by remember { mutableStateOf<Pair<D, P>?>(null) }
    var failed by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    LaunchedEffect(draft, attempt) {
        // The first at once; later ones once typing pauses. A newer draft cancels this one.
        if (answer != null) delay(300)
        failed = null
        runCatching { fetch(draft) }.onSuccess { answer = draft to it }.onFailure { if (it is CancellationException) throw it; failed = failure(it) }
    }
    return Preview(answer?.second, answer?.first == draft, failed) { attempt++ }
}

/** One of the merged one's details to choose, where they differ: a pill each, the chosen one marked. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Options(label: String, options: List<Pair<String, String>>, chosen: String?, hint: String? = null, onChoose: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = colors.muted)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEach { (value, text) ->
                val on = value == chosen
                Row(
                    Modifier.clip(RoundedCornerShape(9.dp)).background(if (on) colors.brandSoft else colors.surface)
                        .border(1.dp, if (on) colors.brand else colors.border, RoundedCornerShape(9.dp))
                        .clickable { onChoose(value) }.padding(horizontal = 12.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(Modifier.size(16.dp).clip(CircleShape).border(if (on) 5.dp else 1.5.dp, if (on) colors.brand else colors.muted, CircleShape))
                    Text(text, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        if (hint != null) Text(hint, style = MaterialTheme.typography.bodySmall, color = colors.muted)
    }
}

/** How many matches together (in bold, as on the website), and that it's for good. */
@Composable
private fun Together(count: String, rest: String) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(colors.brandSoft).padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        PhIcon(Ph.Merge, size = 18.dp, tint = colors.brandStrong)
        Text(
            androidx.compose.ui.text.buildAnnotatedString {
                withStyle(androidx.compose.ui.text.SpanStyle(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)) { append(count) }
                append(" $rest")
            },
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

/** Step 2: what the merged one will be, then Merge. */
@Composable
fun MergeReviewScreen(kind: MergeKind, keptId: String, from: List<String>) {
    if (kind == MergeKind.Venues) VenueReview(keptId, from) else RefereeReview(keptId, from)
}

/** After a merge: back past both steps, and past the kept one's edit page to its own (or to Find duplicates). */
private fun leaveMerge(nav: NavController, kind: MergeKind) {
    nav.popBackStack("${kind.collection}/merge/{id}?with={with}", inclusive = true)
    if (nav.currentDestination?.route == (if (kind == MergeKind.Venues) "venue/{id}/edit" else "referee/{id}/edit")) nav.popBackStack()
}

private const val KEEP = "keep"

@Composable
private fun VenueReview(keptId: String, from: List<String>) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    var name by rememberSaveable { mutableStateOf<String?>(null) }
    var addressFrom by rememberSaveable { mutableStateOf<String?>(null) }
    var choices by remember { mutableStateOf(mapOf<String, VenueMergePreviewPitchesItemChoice>()) }
    var merging by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val draft = VenueMergeDraft(from, name, addressFrom, choices.map { (id, c) -> VenueMergeDraftPitchesItem(id, c.into, c.name) }.ifEmpty { null })
    val preview = rememberPreview(draft) { graph.merging.preview(keptId, it) }
    val p: VenueMergePreview? = preview.shown
    val finalName = p?.let { if (name in it.names) name!! else it.name } ?: ""
    Box(Modifier.fillMaxSize()) {
        Screen("Merge ${from.size + 1} venues", back = "Pick venues") {
            when {
                p == null && preview.failed != null -> item { NeedsConnection(preview.failed, preview.retry) }
                p == null -> item { LfCard { LoadingPitch() } }
                else -> {
                    item { SectionTitle("The merged venue") }
                    item {
                        LfCard {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                Options("Name", p.names.map { it to it }, finalName, if (p.names.size > 1) "The rest are kept as an alias, so searches and imports still find them." else null) { name = it }
                                if (p.places.size > 1) {
                                    val chosen = addressFrom?.takeIf { a -> p.places.any { it.venueId == a } } ?: p.addressFrom
                                    Options("Address and parking", p.places.map { it.venueId to "${it.address ?: "No address"}${if (it.onMap) "" else " · parking not on the map"}" }, chosen) { addressFrom = it }
                                }
                            }
                        }
                        Gap()
                    }
                    if (p.pitches.isNotEmpty()) {
                        item {
                            SectionTitle("Pitches")
                            Text(
                                "Each pitch from ${if (p.venues.size == 2) p.venues[1].name else "the other venues"}: the same as one of ${p.venues[0].name}'s, or kept as a pitch of its own. The ones to check are first.",
                                style = MaterialTheme.typography.bodySmall, color = colors.muted,
                            )
                            Gap()
                        }
                        val firstFine = p.pitches.indexOfFirst { !it.check }
                        p.pitches.forEachIndexed { i, pitch ->
                            if (i == firstFine && firstFine > 0) item { SectionTitle("Likely fine") }
                            item(key = pitch.id) {
                                PitchCard(pitch, choices[pitch.id] ?: pitch.choice) { choices = choices + (pitch.id to it) }
                                Gap(10)
                            }
                        }
                        p.notes.forEach { note -> item { Text("$note.", style = MaterialTheme.typography.bodySmall, color = colors.muted); Gap(8) } }
                    }
                    item {
                        Gap(4)
                        Together(count(p.together), "together, at one venue. Tags are combined and notes joined. This can't be undone.")
                    }
                }
            }
            error?.let { item { Gap(); Text(it, color = colors.redText, style = MaterialTheme.typography.bodySmall) } }
            item { Spacer(Modifier.height(130.dp)) }
        }
        BottomBar {
            val problems = p?.problems ?: 0
            if (problems > 0) Text(if (problems == 1L) "1 pitch needs a look first" else "$problems pitches need a look first", style = MaterialTheme.typography.bodySmall, color = colors.amberText)
            PrimaryButton(
                if (merging) "Merging…" else "Merge ${from.size + 1} into $finalName",
                {
                    val merge = p?.merge ?: return@PrimaryButton
                    scope.launch {
                        merging = true
                        error = null
                        runCatching { graph.merging.merge(keptId, merge) }
                            .onSuccess { runCatching { graph.syncNow() }; leaveMerge(nav, MergeKind.Venues) }
                            .onFailure { error = failure(it); merging = false }
                    }
                },
                Modifier.fillMaxWidth(), icon = Ph.Merge, enabled = preview.current && p?.merge != null && !merging,
            )
        }
    }
}

/** A pitch of a venue merged away: what it is, why it's flagged, and what happens to it. */
@Composable
private fun PitchCard(pitch: VenueMergePreviewPitchesItem, choice: VenueMergePreviewPitchesItemChoice, onChange: (VenueMergePreviewPitchesItemChoice) -> Unit) {
    LfCard {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Column {
                Text(pitch.name, style = MaterialTheme.typography.titleMedium)
                Text(
                    listOfNotNull(
                        pitch.venue, if (pitch.matches == 0L) "No matches" else "${pitch.matches} ${if (pitch.matches == 1L) "match" else "matches"}",
                        pitch.corners.takeIf { it > 0 }?.let { "corners walked ${if (it == 1L) "once" else "$it times"}" }, if (pitch.onMap) null else "not on the map",
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall, color = colors.muted,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                if (pitch.check) Chip("Check", ChipTone.Amber)
                Text(pitch.why, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
            }
            Choice(
                "What happens to it", choice.into ?: KEEP, listOf(KEEP) + pitch.targets.map { it.id },
                { id -> if (id == null || id == KEEP) "Keep as a pitch of its own" else "Same as ${pitch.targets.firstOrNull { it.id == id }?.name ?: "a pitch that isn't kept"}" },
                { id -> onChange(if (id == null || id == KEEP) VenueMergePreviewPitchesItemChoice(name = pitch.name) else VenueMergePreviewPitchesItemChoice(into = id)) },
            )
            if (choice.into == null) Field("Name", choice.name ?: pitch.name, { onChange(VenueMergePreviewPitchesItemChoice(name = it.take(60))) })
            pitch.problem?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = colors.redText) }
        }
    }
}

@Composable
private fun RefereeReview(keptId: String, from: List<String>) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    var name by rememberSaveable { mutableStateOf<String?>(null) }
    var email by rememberSaveable { mutableStateOf<String?>(null) }
    var phone by rememberSaveable { mutableStateOf<String?>(null) }
    var merging by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val preview = rememberPreview(RefereeMergeDraft(from, name, email, phone)) { graph.merging.preview(keptId, it) }
    val p: RefereeMergePreview? = preview.shown
    val pick = { values: List<String>, chosen: String?, fallback: String? -> if (chosen != null && chosen in values) chosen else fallback }
    val finalName = p?.let { pick(it.names, name, it.name) } ?: ""
    Box(Modifier.fillMaxSize()) {
        Screen("Merge ${from.size + 1} referees", back = "Pick referees") {
            when {
                p == null && preview.failed != null -> item { NeedsConnection(preview.failed, preview.retry) }
                p == null -> item { LfCard { LoadingPitch() } }
                else -> {
                    item { SectionTitle("The merged referee") }
                    item {
                        LfCard {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                Options("Name", p.names.map { it to it }, finalName, if (p.names.size > 1) "The rest are kept as an alias, so searches and imports still find them." else null) { name = it }
                                if (p.emails.size > 1) Options("Email", p.emails.map { it to it }, pick(p.emails, email, p.email)) { email = it }
                                if (p.phones.size > 1) Options("Phone", p.phones.map { it to it }, pick(p.phones, phone, p.phone)) { phone = it }
                            }
                        }
                        Gap()
                    }
                    item { Together(count(p.together), "together, as one referee. Tags are combined and notes joined. This can't be undone.") }
                }
            }
            error?.let { item { Gap(); Text(it, color = colors.redText, style = MaterialTheme.typography.bodySmall) } }
            item { Spacer(Modifier.height(110.dp)) }
        }
        BottomBar {
            PrimaryButton(
                if (merging) "Merging…" else "Merge ${from.size + 1} into $finalName",
                {
                    val merge = p?.merge ?: return@PrimaryButton
                    scope.launch {
                        merging = true
                        error = null
                        runCatching { graph.merging.merge(keptId, merge) }
                            .onSuccess { runCatching { graph.syncNow() }; leaveMerge(nav, MergeKind.Referees) }
                            .onFailure { error = failure(it); merging = false }
                    }
                },
                Modifier.fillMaxWidth(), icon = Ph.Merge, enabled = preview.current && p != null && !merging,
            )
        }
    }
}
