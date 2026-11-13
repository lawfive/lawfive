package app.lawfive.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.lawfive.data.json
import app.lawfive.schema.Place
import app.lawfive.schema.Position
import app.lawfive.ui.components.LinkButton
import app.lawfive.ui.components.MapPin
import app.lawfive.ui.components.VenueMap
import app.lawfive.ui.formatShortDay
import app.lawfive.ui.instantOf
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.jsonObject
import java.util.Locale
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lawfive.data.Collections
import app.lawfive.schema.Competition
import app.lawfive.schema.CompetitionType
import app.lawfive.schema.MatchFormat
import app.lawfive.schema.MatchTemplate
import app.lawfive.schema.MatchTemplateDefaults
import app.lawfive.schema.Pitch
import app.lawfive.schema.Referee
import app.lawfive.schema.Venue
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.mostMatchesFirst
import app.lawfive.ui.matchCounts
import app.lawfive.ui.describeCount
import app.lawfive.ui.surname
import app.lawfive.ui.LocalNav
import app.lawfive.ui.components.Avatar
import app.lawfive.ui.components.Chip
import app.lawfive.ui.components.Choice
import app.lawfive.ui.components.Confirm
import app.lawfive.ui.components.EmptyPicture
import app.lawfive.ui.components.EmptyState
import app.lawfive.ui.components.NoResults
import app.lawfive.ui.components.Field
import app.lawfive.ui.components.Gap
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.ListRow
import app.lawfive.ui.components.LoadingPitch
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PrimaryButton
import app.lawfive.ui.components.Screen
import app.lawfive.ui.components.SearchField
import app.lawfive.ui.components.UnsavedChanges
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.components.SectionTitle
import app.lawfive.ui.describeFormat
import app.lawfive.ui.theme.colors
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID

// Venues, referees, competitions and templates (APP-4): each listed, searchable, and added,
// changed or deleted on the phone (synced when there's signal).

fun newId(): String = UUID.randomUUID().toString()
fun now(): String = Instant.now().toString()

/** Text in a field, or null when it's empty. */
fun String.orNull(): String? = trim().ifEmpty { null }

@Composable
fun VenuesScreen() {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val loadedvenues by graph.records.venues.collectAsStateWithLifecycle(null)
    val matches by graph.records.matches.collectAsStateWithLifecycle(emptyList())
    val counts = remember(matches) { matchCounts(matches) { m -> listOfNotNull(m.venueId) } }
    val venues = loadedvenues ?: emptyList()
    var query by rememberSaveable { mutableStateOf("") }
    var tag by rememberSaveable { mutableStateOf<String?>(null) }
    val allTags = venues.flatMap { it.tags ?: emptyList() }.distinct().sortedBy { it.lowercase() }
    val mergingOffered by produceState(false) { value = graph.mergingOffered() }
    val shown = venues.filter { v -> tag == null || v.tags?.contains(tag) == true }.filter { v -> query.isBlank() || listOfNotNull(v.name, *(v.aliases ?: emptyList()).toTypedArray(), v.address, v.notes, *v.pitches.flatMap { listOf(it.name) + (it.aliases ?: emptyList()) }.toTypedArray(), *(v.tags ?: emptyList()).toTypedArray()).joinToString(" ").contains(query, true) }
        .sortedWith(mostMatchesFirst(counts, { it.id }, { it.name }))
    Screen("Venues", status = syncLine(short = true), add = "Add a venue" to { nav.navigate("venue/new") }, refresh = syncRefresh()) {
        val pins = shown.mapNotNull { v -> venuePosition(v)?.let { MapPin(v.id, it.lat, it.lon, MapPin.Kind.Venue) } }
        // DUP-13: likely duplicates, first.
        item(key = "duplicates") { DuplicatesNotice(app.lawfive.data.MergeKind.Venues) }
        if (pins.isNotEmpty()) item(key = "map") { VenueMap(pins, height = 240.dp, onPinClick = { nav.navigate("venue/$it") }); Gap() }
        // A key, so the search box stays the same field if the map above it goes (APP-17).
        item(key = "search") { SearchField(query, { query = it }, "Names, addresses, pitches, tags", allTags, tag, { tag = it }); Gap() }
        item {
            LfCard {
                if (loadedvenues == null) LoadingPitch() else if (venues.isEmpty()) EmptyState(EmptyPicture.Venue, "No venues yet", "Save a ground once to keep its address, parking and pitches at hand.") { PrimaryButton("Add a venue", { nav.navigate("venue/new") }, icon = Ph.Plus) }
                else if (shown.isEmpty()) NoResults("No venues match \"${query.ifBlank { tag ?: "" }}\"")
                shown.forEachIndexed { i, v ->
                    ListRow(
                        v.name,
                        // APP-19: the count first, as a long address is what should run out of room.
                        listOf(describeCount(counts[v.id]), v.address).filterNot { it.isNullOrBlank() }.joinToString(" · "),
                        leading = { Avatar(icon = Ph.Venues) },
                        trailing = { if (venuePosition(v) == null) Chip("Not on the map", app.lawfive.ui.components.ChipTone.Amber) },
                        divider = i > 0,
                        onClick = { nav.navigate("venue/${v.id}") },
                    )
                }
            }
        }
        // DUP-7, DUP-12: on servers that work out duplicates.
        if (mergingOffered && venues.size > 1) item { Gap(); SecondaryButton("Find duplicates", { nav.navigate("venues/duplicates") }, Modifier.fillMaxWidth(), icon = Ph.Merge) }
    }
}

@Composable
fun VenueEditScreen(id: String?) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val saved by remember(id) { if (id != null) graph.records.one(Collections.VENUES, id, Venue.serializer()) else kotlinx.coroutines.flow.flowOf(null) }
        .collectAsStateWithLifecycle(null)
    if (id != null && saved == null) {
        Screen("Venue", back = "Venues") { item { LoadingPitch() } }
        return
    }
    var name by rememberSaveable(saved?.id) { mutableStateOf(saved?.name ?: "") }
    var address by rememberSaveable(saved?.id) { mutableStateOf(saved?.address ?: "") }
    var notes by rememberSaveable(saved?.id) { mutableStateOf(saved?.notes ?: "") }
    var tags by rememberSaveable(saved?.id) { mutableStateOf(saved?.tags?.joinToString(", ") ?: "") }
    var pitches by remember(saved?.id) { mutableStateOf(saved?.pitches ?: emptyList()) }
    var position by remember(saved?.id) { mutableStateOf(saved?.position) }
    val state = listOf(name, address, notes, tags, pitches, position)
    val start = remember(saved?.id) { state }
    UnsavedChanges(state != start) // APP-18
    var placing by rememberSaveable(saved?.id) { mutableStateOf(PARKING) }
    // Bumped when an address is found, to bring the map to it.
    var fitKey by remember { mutableStateOf(0) }
    var deleting by remember { mutableStateOf(false) }
    var forgetting by remember { mutableStateOf<String?>(null) }
    val recordId = remember(saved?.id) { saved?.id ?: newId() }
    fun place(target: String, lat: Double, lon: Double) {
        if (target == PARKING) position = Position(lat, lon)
        else pitches = pitches.map { if (it.id == target) it.copy(position = Position(lat, lon)) else it }
    }
    // Find on map (shared with a venue made from the match form, WEB-12): one place found is used straight away.
    val search = app.lawfive.ui.components.rememberAddressLookUp { p ->
        position = Position(p.lat, p.lon)
        fitKey++
    }
    fun lookUp() = scope.launch { search.lookUp(address) }
    val mergingOffered by produceState(false) { value = graph.mergingOffered() }
    Screen(
        if (id == null) "New venue" else "Edit venue", back = if (id == null) "Venues" else saved!!.name, label = saved?.let { "Venue · ${it.name}" },
        // DUP-7, DUP-12: as on the website's edit page.
        actions = if (id != null && mergingOffered) { { SecondaryButton("Merge with…", { nav.navigate(mergeRoute(app.lawfive.data.MergeKind.Venues, id)) }, icon = Ph.Merge) } } else null,
        bottomBar = {
            FormActions(
                canSave = name.isNotBlank(),
                onSave = {
                    scope.launch {
                        val base = saved ?: Venue(id = recordId, version = 0, updatedAt = now(), name = "", pitches = emptyList())
                        graph.records.save(Collections.VENUES, recordId, Venue.serializer(), base.copy(
                            name = name.trim(), address = address.orNull(), position = position, notes = notes.orNull(), pitches = pitches.map { it.copy(name = it.name.trim().ifEmpty { "Field" }) },
                            tags = tags.split(",").mapNotNull { it.orNull() }.ifEmpty { null },
                        ))
                        nav.popBackStack()
                    }
                },
                deleteLabel = if (id != null) "Delete venue" else null,
                onDelete = { deleting = true },
            )
        },
    ) {
        item {
            LfCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Field("Name", name, { name = it })
                    Field("Address", address, { address = it }, supporting = "Usually where you park. The pitches can be some way off, so each one gets its own spot on the map.")
                    if (search.available) {
                        SecondaryButton(if (search.looking) "Looking…" else "Find on map", { lookUp() }, icon = Ph.Search, enabled = address.isNotBlank() && !search.looking)
                    }
                    app.lawfive.ui.components.FoundPlaces(search, "Place the pin on the map instead.")
                    Field("Tags", tags, { tags = it }, supporting = "Separated by commas")
                    Field("Notes", notes, { notes = it }, singleLine = false, minLines = 3, placeholder = "Parking, toilets, lightning policy…")
                }
            }
        }
        item { SectionTitle("Map") }
        item {
            LfCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Muted("Choose what to place, then tap the map.")
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        PlaceTarget("P", "Parking", parking = true, placed = position != null, on = placing == PARKING) { placing = PARKING }
                        pitches.forEachIndexed { i, p -> PlaceTarget("${i + 1}", p.name, parking = false, placed = p.position != null, on = placing == p.id) { placing = p.id } }
                    }
                    val pins = listOfNotNull(position?.let { MapPin(PARKING, it.lat, it.lon, MapPin.Kind.Parking, "P") }) +
                        pitches.mapIndexedNotNull { i, p -> p.position?.let { MapPin(p.id, it.lat, it.lon, MapPin.Kind.Pitch, "${i + 1}") } }
                    VenueMap(pins, height = 320.dp, activeId = placing, fitKey = fitKey, onPick = { lat, lon -> place(placing, lat, lon) })
                }
            }
        }
        item { SectionTitle("Pitches") }
        item {
            LfCard {
                pitches.forEachIndexed { i, p ->
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            MiniPin("${i + 1}", parking = false)
                            Field("Name", p.name, { n -> pitches = pitches.map { if (it.id == p.id) it.copy(name = n) else it } }, Modifier.weight(1f))
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Muted(p.position?.let { String.format(Locale.US, "%.5f, %.5f", it.lat, it.lon) } ?: "Not on the map yet", Modifier.weight(1f))
                            LinkButton("Place") { placing = p.id }
                            LinkButton("Remove") { pitches = pitches.filter { it.id != p.id }; if (placing == p.id) placing = PARKING }
                        }
                        // TRK-13: corners walked on the watch, used for this pitch's matches from then on.
                        p.markings?.lastOrNull()?.let { last ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Muted("Corners walked ${instantOf(last.at)?.let { formatShortDay(it.atZone(java.time.ZoneId.systemDefault())) } ?: ""}", Modifier.weight(1f))
                                LinkButton("Forget") { forgetting = p.id }
                            }
                        }
                    }
                }
                Row(Modifier.padding(16.dp)) {
                    SecondaryButton("Add a pitch", {
                        val pitch = Pitch(id = newId(), name = "Field ${pitches.size + 1}")
                        pitches = pitches + pitch
                        placing = pitch.id
                    }, icon = Ph.Plus)
                }
            }
        }
        if (id != null) {
            item { app.lawfive.ui.components.Gap(16); PhotosSection("venue", recordId) }
        }
    }
    forgetting?.let { pitchId ->
        Confirm("Forget the corners?", "Its later matches go back to the pitch found from each track.", "Forget", onConfirm = {
            pitches = pitches.map { if (it.id == pitchId) it.copy(markings = null) else it }
            forgetting = null
        }, onDismiss = { forgetting = null })
    }
    if (deleting) {
        Confirm("Delete venue?", "${saved?.name} goes from LawFive, on every device. Matches there keep their details.", "Delete", onConfirm = {
            deleting = false
            // Past its own page, which has gone too.
            scope.launch { graph.records.delete(Collections.VENUES, recordId); nav.popBackStack("venues", false) }
        }, onDismiss = { deleting = false })
    }
}

@Composable
fun RefereesScreen() {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val loadedreferees by graph.records.referees.collectAsStateWithLifecycle(null)
    val matches by graph.records.matches.collectAsStateWithLifecycle(emptyList())
    val counts = remember(matches) { matchCounts(matches) { m -> m.crew.mapNotNull { it.refereeId } } }
    val referees = loadedreferees ?: emptyList()
    var query by rememberSaveable { mutableStateOf("") }
    var tag by rememberSaveable { mutableStateOf<String?>(null) }
    val allTags = referees.flatMap { it.tags ?: emptyList() }.distinct().sortedBy { it.lowercase() }
    val pictures = rememberRefereePictures()
    val mergingOffered by produceState(false) { value = graph.mergingOffered() }
    val shown = referees.filter { r -> tag == null || r.tags?.contains(tag) == true }.filter { r -> query.isBlank() || listOfNotNull(r.name, r.email, r.phone, r.notes, *(r.aliases ?: emptyList()).toTypedArray(), *(r.tags ?: emptyList()).toTypedArray()).joinToString(" ").contains(query, true) }
        .sortedWith(mostMatchesFirst(counts, { it.id }, { it.name }))
    Screen(
        "Referees", sub = "The officials you work with.",
        status = syncLine(short = true), add = "Add a referee" to { nav.navigate("referee/new") }, refresh = syncRefresh(),
    ) {
        // DUP-13: likely duplicates, first.
        item(key = "duplicates") { DuplicatesNotice(app.lawfive.data.MergeKind.Referees) }
        item(key = "search") { SearchField(query, { query = it }, "Names, email, phone, tags", allTags, tag, { tag = it }); Gap() }
        item {
            LfCard {
                if (loadedreferees == null) LoadingPitch() else if (referees.isEmpty()) EmptyState(EmptyPicture.Crew, "No referees yet", "Save the people you work with, so you can add them to a match and get in touch.") { PrimaryButton("Add a referee", { nav.navigate("referee/new") }, icon = Ph.Plus) }
                else if (shown.isEmpty()) NoResults("No referees match \"${query.ifBlank { tag ?: "" }}\"")
                shown.forEachIndexed { i, r ->
                    ListRow(
                        r.name,
                        // APP-19: the count first.
                        listOf(describeCount(counts[r.id]), r.notes ?: r.aliases?.let { "Also ${it.joinToString(", ")}" }).filterNot { it.isNullOrBlank() }.joinToString(" · "),
                        leading = { RefereeAvatar(r, pictures[r.id]) },
                        // WEB-23: Call, Text and Email rather than the number and address.
                        trailing = { app.lawfive.ui.components.ContactButtons(r.phone, r.email, r.name) },
                        divider = i > 0,
                        onClick = { nav.navigate("referee/${r.id}") },
                    )
                }
            }
        }
        // DUP-1, DUP-12: on servers that work out duplicates.
        if (mergingOffered && referees.size > 1) item { Gap(); SecondaryButton("Find duplicates", { nav.navigate("referees/duplicates") }, Modifier.fillMaxWidth(), icon = Ph.Merge) }
    }
}

@Composable
fun RefereeEditScreen(id: String?) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val saved by remember(id) { if (id != null) graph.records.one(Collections.REFEREES, id, Referee.serializer()) else kotlinx.coroutines.flow.flowOf(null) }
        .collectAsStateWithLifecycle(null)
    if (id != null && saved == null) {
        Screen("Referee", back = "Referees") { item { LoadingPitch() } }
        return
    }
    var name by rememberSaveable(saved?.id) { mutableStateOf(saved?.name ?: "") }
    var shortName by rememberSaveable(saved?.id) { mutableStateOf(saved?.shortName ?: "") }
    var email by rememberSaveable(saved?.id) { mutableStateOf(saved?.email ?: "") }
    var phone by rememberSaveable(saved?.id) { mutableStateOf(saved?.phone ?: "") }
    var aliases by rememberSaveable(saved?.id) { mutableStateOf(saved?.aliases?.joinToString(", ") ?: "") }
    var tags by rememberSaveable(saved?.id) { mutableStateOf(saved?.tags?.joinToString(", ") ?: "") }
    var notes by rememberSaveable(saved?.id) { mutableStateOf(saved?.notes ?: "") }
    val state = listOf(name, shortName, email, phone, aliases, tags, notes)
    val start = remember(saved?.id) { state }
    UnsavedChanges(state != start) // APP-18
    var deleting by remember { mutableStateOf(false) }
    val recordId = remember(saved?.id) { saved?.id ?: newId() }
    val mergingOffered by produceState(false) { value = graph.mergingOffered() }
    Screen(
        if (id == null) "Add referee" else "Edit referee", back = if (id == null) "Referees" else saved!!.name, label = saved?.let { "Referee · ${it.name}" },
        // DUP-1, DUP-12: as on the website's edit page.
        actions = if (id != null && mergingOffered) { { SecondaryButton("Merge with…", { nav.navigate(mergeRoute(app.lawfive.data.MergeKind.Referees, id)) }, icon = Ph.Merge) } } else null,
        bottomBar = {
            FormActions(
                canSave = name.isNotBlank(),
                onSave = {
                    scope.launch {
                        val base = saved ?: Referee(id = recordId, version = 0, updatedAt = now(), name = "")
                        graph.records.save(Collections.REFEREES, recordId, Referee.serializer(), base.copy(
                            name = name.trim(), shortName = shortName.orNull(), email = email.orNull(), phone = phone.orNull(), notes = notes.orNull(),
                            aliases = aliases.split(",").mapNotNull { it.orNull() }.ifEmpty { null },
                            tags = tags.split(",").mapNotNull { it.orNull() }.ifEmpty { null },
                        ))
                        nav.popBackStack()
                    }
                },
                deleteLabel = if (id != null) "Delete referee" else null,
                onDelete = { deleting = true },
            )
        },
    ) {
        item {
            LfCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Field("Name", name, { name = it })
                    // WEB-20: what the officials line calls them; until one is typed, the hint says what it guesses.
                    val guess = surname(name)
                    Field("Shown as", shortName, { shortName = it }, placeholder = guess, supporting = if (shortName.isBlank() && guess.isNotEmpty()) "Match cards show \u201C$guess\u201D, from the name" else "What match cards call them")
                    Field("Email", email, { email = it }, keyboard = KeyboardType.Email)
                    Field("Phone", phone, { phone = it }, keyboard = KeyboardType.Phone)
                    Field("Other names", aliases, { aliases = it }, supporting = "How their name is written elsewhere (Doe, John), separated by commas")
                    Field("Tags", tags, { tags = it }, supporting = "Separated by commas")
                    Field("Notes", notes, { notes = it }, singleLine = false, minLines = 3)
                }
            }
        }
        if (id != null) {
            item { Gap(16); PhotosSection("referee", recordId) }
        }
    }
    if (deleting) {
        Confirm("Delete referee?", "${saved?.name} goes from LawFive, on every device. Matches keep their crew.", "Delete", onConfirm = {
            deleting = false
            // Past their own page, which has gone too.
            scope.launch { graph.records.delete(Collections.REFEREES, recordId); nav.popBackStack("referees", false) }
        }, onDismiss = { deleting = false })
    }
}

@Composable
fun CompetitionsScreen() {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val loadedcompetitions by graph.records.competitions.collectAsStateWithLifecycle(null)
    val competitions = loadedcompetitions ?: emptyList()
    // APP-3: pull to refresh on every page of synced data.
    Screen("Competitions", sub = "Leagues, cups and tournaments.", back = "More", add = "Add a competition" to { nav.navigate("competition/new") }, refresh = syncRefresh()) {
        item {
            LfCard {
                if (loadedcompetitions == null) LoadingPitch() else if (competitions.isEmpty()) EmptyState(EmptyPicture.Bracket, "No competitions yet", "Keep each league or cup together, and let it set the format of its matches.") { PrimaryButton("Add a competition", { nav.navigate("competition/new") }, icon = Ph.Plus) }
                competitions.sortedBy { it.name.lowercase() }.forEachIndexed { i, c ->
                    ListRow(c.name, listOfNotNull(c.type.replaceFirstChar { it.uppercase() }, c.season, c.organiser).joinToString(" · "),
                        leading = { Avatar(icon = Ph.Competitions) }, divider = i > 0, onClick = { nav.navigate("competition/${c.id}") })
                }
            }
        }
    }
}

@Composable
fun CompetitionEditScreen(id: String?) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val saved by remember(id) { if (id != null) graph.records.one(Collections.COMPETITIONS, id, Competition.serializer()) else kotlinx.coroutines.flow.flowOf(null) }
        .collectAsStateWithLifecycle(null)
    val templates by graph.records.templates.collectAsStateWithLifecycle(emptyList())
    if (id != null && saved == null) {
        Screen("Competition", back = "Competitions") { item { LoadingPitch() } }
        return
    }
    var name by rememberSaveable(saved?.id) { mutableStateOf(saved?.name ?: "") }
    var type by rememberSaveable(saved?.id) { mutableStateOf(saved?.type ?: CompetitionType.LEAGUE) }
    var season by rememberSaveable(saved?.id) { mutableStateOf(saved?.season ?: "") }
    var organiser by rememberSaveable(saved?.id) { mutableStateOf(saved?.organiser ?: "") }
    var ageGroup by rememberSaveable(saved?.id) { mutableStateOf(saved?.ageGroup ?: "") }
    var templateId by rememberSaveable(saved?.id) { mutableStateOf(saved?.templateId) }
    var notes by rememberSaveable(saved?.id) { mutableStateOf(saved?.notes ?: "") }
    val state = listOf(name, type, season, organiser, ageGroup, templateId, notes)
    val start = remember(saved?.id) { state }
    UnsavedChanges(state != start) // APP-18
    var deleting by remember { mutableStateOf(false) }
    val recordId = remember(saved?.id) { saved?.id ?: newId() }
    Screen(if (id == null) "New competition" else saved!!.name, back = "Competitions",
        bottomBar = {
            FormActions(
                canSave = name.isNotBlank(),
                onSave = {
                    scope.launch {
                        val base = saved ?: Competition(id = recordId, version = 0, updatedAt = now(), name = "", type = CompetitionType.LEAGUE)
                        graph.records.save(Collections.COMPETITIONS, recordId, Competition.serializer(), base.copy(
                            name = name.trim(), type = type, season = season.orNull(), organiser = organiser.orNull(), ageGroup = ageGroup.orNull(),
                            templateId = templateId, notes = notes.orNull(),
                        ))
                        nav.popBackStack()
                    }
                },
                deleteLabel = if (id != null) "Delete competition" else null,
                onDelete = { deleting = true },
            )
        },
    ) {
        item {
            LfCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Field("Name", name, { name = it })
                    Choice("Type", type, CompetitionType.all, { (it ?: "").replaceFirstChar { c -> c.uppercase() } }, { type = it ?: CompetitionType.LEAGUE })
                    Field("Season", season, { season = it }, placeholder = "2026–27")
                    Field("Organizer", organiser, { organiser = it })
                    Field("Age group", ageGroup, { ageGroup = it }, placeholder = "U12, Adult, O35")
                    Choice("Template", templates.firstOrNull { it.id == templateId }, templates.sortedBy { it.name }, { it?.name ?: "None" }, { templateId = it?.id }, allowNone = "None")
                    Field("Notes", notes, { notes = it }, singleLine = false, minLines = 3)
                }
            }
        }
    }
    if (deleting) {
        Confirm("Delete competition?", "${saved?.name} goes from LawFive, on every device.", "Delete", onConfirm = {
            deleting = false
            scope.launch { graph.records.delete(Collections.COMPETITIONS, recordId); nav.popBackStack() }
        }, onDismiss = { deleting = false })
    }
}

@Composable
fun TemplatesScreen() {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val loadedtemplates by graph.records.templates.collectAsStateWithLifecycle(null)
    val templates = loadedtemplates ?: emptyList()
    Screen("Templates", sub = "Formats you use often.", back = "More", add = "Add a template" to { nav.navigate("template/new") }, refresh = syncRefresh()) {
        item {
            LfCard {
                if (loadedtemplates == null) LoadingPitch() else if (templates.isEmpty()) EmptyState(EmptyPicture.Format, "No templates yet", "Save a match format once and reuse it for every game played that way.") { PrimaryButton("Add a template", { nav.navigate("template/new") }, icon = Ph.Plus) }
                templates.sortedBy { it.name.lowercase() }.forEachIndexed { i, t ->
                    ListRow(t.name, describeFormat(t.format), leading = { Avatar(icon = Ph.Templates) }, divider = i > 0, onClick = { nav.navigate("template/${t.id}") })
                }
            }
        }
    }
}

val defaultFormat = MatchFormat(
    periods = 2, periodSec = 45 * 60, breakSec = 15 * 60, halfwayBreak = false, halfwayBreakSec = 120, teamSize = 11, clock = "up",
    trackStoppage = false, breakStoppage = true, goalScorers = true, goalTypes = false, extraTime = false, extraTimePeriods = 2, extraTimePeriodSec = 15 * 60, penalties = false,
)

@Composable
fun TemplateEditScreen(id: String?) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val saved by remember(id) { if (id != null) graph.records.one(Collections.TEMPLATES, id, MatchTemplate.serializer()) else kotlinx.coroutines.flow.flowOf(null) }
        .collectAsStateWithLifecycle(null)
    if (id != null && saved == null) {
        Screen("Template", back = "Templates") { item { LoadingPitch() } }
        return
    }
    var name by rememberSaveable(saved?.id) { mutableStateOf(saved?.name ?: "") }
    var format by remember(saved?.id) { mutableStateOf(saved?.format ?: defaultFormat) }
    val state = listOf(name, format)
    val start = remember(saved?.id) { state }
    UnsavedChanges(state != start) // APP-18
    var deleting by remember { mutableStateOf(false) }
    val recordId = remember(saved?.id) { saved?.id ?: newId() }
    Screen(if (id == null) "New template" else saved!!.name, back = "Templates",
        bottomBar = {
            FormActions(
                canSave = name.isNotBlank(),
                onSave = {
                    scope.launch {
                        val base = saved ?: MatchTemplate(id = recordId, version = 0, updatedAt = now(), name = "", format = defaultFormat, defaults = MatchTemplateDefaults())
                        graph.records.save(Collections.TEMPLATES, recordId, MatchTemplate.serializer(), base.copy(name = name.trim(), format = format))
                        nav.popBackStack()
                    }
                },
                deleteLabel = if (id != null) "Delete template" else null,
                onDelete = { deleting = true },
            )
        },
    ) {
        item {
            LfCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Field("Name", name, { name = it }, placeholder = "U12 league: 2 × 30")
                }
            }
        }
        item { SectionTitle("Format") }
        item { FormatFields(format) { format = it } }
    }
    if (deleting) {
        Confirm("Delete template?", "${saved?.name} goes from LawFive. Matches made from it keep their format.", "Delete", onConfirm = {
            deleting = false
            scope.launch { graph.records.delete(Collections.TEMPLATES, recordId); nav.popBackStack() }
        }, onDismiss = { deleting = false })
    }
}

/**
 * A match's format, in the web's groups and with its choices and ranges (APP-20, WEB-15). What only
 * matters with a switch on opens under that switch.
 */
@Composable
fun FormatFields(format: MatchFormat, onChange: (MatchFormat) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        LfCard {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Choice("Periods", format.periods, listOf(1, 2, 3, 4), { "${it ?: 2}" }, { onChange(format.copy(periods = it ?: 2)) }, Modifier.weight(1f))
                    NumberField("Team size", format.teamSize, { onChange(format.copy(teamSize = it.coerceIn(1, 11))) }, Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    MinutesField("Period (min)", format.periodSec, 1, 60, { onChange(format.copy(periodSec = it)) }, Modifier.weight(1f))
                    MinutesField(when (format.periods) { 2 -> "Half-time (min)"; 1 -> "Before ET (min)"; else -> "Break (min)" }, format.breakSec, 0, 30, { onChange(format.copy(breakSec = it)) }, Modifier.weight(1f))
                }
            }
        }
        LfCard {
            app.lawfive.ui.components.ToggleRow("Halfway break", "A break halfway through each period", format.halfwayBreak, { onChange(format.copy(halfwayBreak = it)) })
            if (format.halfwayBreak) {
                MinutesField("Break length (min)", format.halfwayBreakSec, 0, 15, { onChange(format.copy(halfwayBreakSec = it)) }, Modifier.padding(horizontal = 16.dp, vertical = 10.dp))
                // TMR-12: it only applies with a stoppage clock to add the break to; a clock that stops stops for the break anyway (TMR-15).
                if (format.trackStoppage && format.stoppingClock != true) {
                    app.lawfive.ui.components.ToggleRow("Add the break to stoppage", "The break's time is added on", format.breakStoppage ?: true, { onChange(format.copy(breakStoppage = it)) })
                }
            }
        }
        // EVT-12: Sin bin in the watch's team menu, its countdown running with the match clock.
        LfCard {
            app.lawfive.ui.components.ToggleRow("Sin bins", "Temporary dismissals, timed on the watch", format.sinBins ?: false, { onChange(format.copy(sinBins = it, sinBinSec = format.sinBinSec ?: 600)) })
            if (format.sinBins == true) {
                WholeMinutesField("Sin bin length (min)", format.sinBinSec ?: 600, 1, 20, { onChange(format.copy(sinBinSec = it)) }, Modifier.padding(horizontal = 16.dp, vertical = 10.dp))
            }
        }
        LfCard {
            app.lawfive.ui.components.ToggleRow("Extra time", "If the score is level at full time", format.extraTime, { onChange(format.copy(extraTime = it)) })
            if (format.extraTime) {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Choice("Periods", format.extraTimePeriods, listOf(1, 2), { "${it ?: 2}" }, { onChange(format.copy(extraTimePeriods = it ?: 2)) }, Modifier.weight(1f))
                    MinutesField("Length (min)", format.extraTimePeriodSec, 1, 30, { onChange(format.copy(extraTimePeriodSec = it)) }, Modifier.weight(1f))
                }
                // ET-6.
                app.lawfive.ui.components.ToggleRow("Golden goal", "The first goal in extra time wins", format.goldenGoal ?: false, { onChange(format.copy(goldenGoal = it)) })
            }
            app.lawfive.ui.components.ToggleRow("Penalty shoot-out", "If still level", format.penalties, { onChange(format.copy(penalties = it)) })
        }
        LfCard {
            // TMR-15: the clock that stops, for US high school and college: stoppage tracking goes with it.
            val stops = format.stoppingClock == true
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Choice("Clock", stops, listOf(false, true), { if (it == true) "Stops when play stops" else "Runs on" }, {
                    onChange(if (it == true) format.copy(stoppingClock = true, trackStoppage = true, stopForGoalsCards = format.stopForGoalsCards ?: true) else format.copy(stoppingClock = false))
                })
                androidx.compose.material3.Text(
                    if (stops) "US high school (NFHS) and college (NCAA) rules: the watch stops the clock for stoppages, with no added time."
                    else "The Laws of the Game: stoppages are added on at the end.",
                    style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                )
            }
            if (stops) {
                app.lawfive.ui.components.ToggleRow("Goals and cards stop it", "Recording a goal or card on the watch stops the clock; Start/Stop starts it again at the restart. An injury always stops it.", format.stopForGoalsCards ?: true, { onChange(format.copy(stopForGoalsCards = it)) })
            }
            app.lawfive.ui.components.ToggleRow("Track stoppage", if (stops) "On with a clock that stops" else "A clock on the watch for time to add on", format.trackStoppage || stops, { onChange(format.copy(trackStoppage = it)) }, enabled = !stops)
            app.lawfive.ui.components.ToggleRow("Record goal scorers", "The watch asks for the number", format.goalScorers ?: true, { onChange(format.copy(goalScorers = it)) })
            app.lawfive.ui.components.ToggleRow("Record goal types", "Penalty, own goal, direct free kick", format.goalTypes, { onChange(format.copy(goalTypes = it)) })
        }
    }
}

/** Minutes, half minutes included, as a number of seconds kept in range. */
@Composable
fun MinutesField(label: String, sec: Int, min: Int, max: Int, onChange: (Int) -> Unit, modifier: Modifier = Modifier) {
    fun show(s: Int) = if (s % 60 == 0) "${s / 60}" else "${s / 60.0}"
    fun secondsOf(t: String) = t.toDoubleOrNull()?.let { Math.round(it * 60).toInt() }
    var text by remember { mutableStateOf(show(sec)) }
    // Follows a change from elsewhere (a template, a value brought into range), but not typing, so "2." stays while on the way to 2.5.
    androidx.compose.runtime.LaunchedEffect(sec) { if (secondsOf(text) != sec) text = show(sec) }
    Field(label, text, { t ->
        text = t.filter { it.isDigit() || it == '.' }.take(5)
        secondsOf(text)?.let { onChange(it.coerceIn(min * 60, max * 60)) }
    }, modifier, keyboard = KeyboardType.Decimal)
}

/** Whole minutes as a number of seconds kept in range, as the watch's two-digit entry (EVT-12's sin bin length). */
@Composable
fun WholeMinutesField(label: String, sec: Int, min: Int, max: Int, onChange: (Int) -> Unit, modifier: Modifier = Modifier) {
    var text by remember { mutableStateOf("${sec / 60}") }
    // Follows a change from elsewhere (a value brought into range), but not typing, so an emptied field stays empty.
    androidx.compose.runtime.LaunchedEffect(sec) { if (text.toIntOrNull()?.times(60) != sec) text = "${sec / 60}" }
    Field(label, text, { t ->
        text = t.filter { it.isDigit() }.take(2)
        text.toIntOrNull()?.let { onChange(it.coerceIn(min, max) * 60) }
    }, modifier, keyboard = KeyboardType.Number)
}

@Composable
fun NumberField(label: String, value: Int, onChange: (Int) -> Unit, modifier: Modifier = Modifier) {
    var text by remember(value) { mutableStateOf("$value") }
    Field(label, text, { t -> text = t.filter { it.isDigit() }.take(3); text.toIntOrNull()?.let(onChange) }, modifier, keyboard = KeyboardType.Number)
}

/** A number that can be left out: empty (with `placeholder`) when it isn't set, and clearing it clears it. */
@Composable
fun OptionalNumberField(label: String, value: Int?, onChange: (Int?) -> Unit, placeholder: String? = null, supporting: String? = null) {
    var text by remember(value) { mutableStateOf(value?.toString() ?: "") }
    Field(label, text, { t -> text = t.filter { it.isDigit() }.take(3); onChange(text.toIntOrNull()) }, keyboard = KeyboardType.Number, placeholder = placeholder, supporting = supporting)
}

/**
 * APP-25: a form's bar, fixed at the foot of the page above the tabs (Screen's bottomBar): Delete on
 * the left when editing, as an icon for room, then Cancel and Save. Cancel leaves as Back does,
 * asking first when there are changes (APP-18).
 */
@Composable
fun FormActions(canSave: Boolean, onSave: () -> Unit, deleteLabel: String?, onDelete: () -> Unit, message: String? = null) {
    val nav = LocalNav.current
    val guard = app.lawfive.ui.components.LocalLeaveGuard.current
    Column {
        // Why Save didn't save, just over it, where the eye is when it's tapped.
        if (message != null) Text(message, style = MaterialTheme.typography.bodyMedium, color = colors.redText, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            if (deleteLabel != null) {
                val shape = androidx.compose.foundation.shape.RoundedCornerShape(10.dp)
                androidx.compose.foundation.layout.Box(
                    Modifier.size(44.dp).clip(shape).border(1.dp, colors.border, shape).background(colors.surface).clickable(onClickLabel = deleteLabel, onClick = onDelete),
                    contentAlignment = androidx.compose.ui.Alignment.Center,
                ) { app.lawfive.ui.components.PhIcon(Ph.Trash, deleteLabel, size = 19.dp, tint = colors.redText) }
            }
            androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
            SecondaryButton("Cancel", { guard.leave { nav.popBackStack() } })
            PrimaryButton("Save", onSave, enabled = canSave)
        }
    }
}

@Suppress("unused")
@Composable
private fun Muted(text: String, modifier: Modifier = Modifier) = Text(text, modifier, style = MaterialTheme.typography.bodySmall, color = colors.muted)

/** The id the map's parking pin goes by. */
private const val PARKING = "parking"

/** Where a venue goes on an overview map: its parking spot, else its first placed pitch. */
fun venuePosition(v: Venue): Position? = v.position ?: v.pitches.firstNotNullOfOrNull { it.position }

/** A pin's mark in a circle, in the map pin's colour. */
@Composable
fun MiniPin(mark: String, parking: Boolean, size: androidx.compose.ui.unit.Dp = 22.dp) {
    Box(Modifier.size(size).clip(CircleShape).background(if (parking) Color(0xFF1D5FA8) else colors.brand), contentAlignment = Alignment.Center) {
        Text(mark, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

/** One of the things to place on the venue's map. */
@Composable
private fun PlaceTarget(mark: String, name: String, parking: Boolean, placed: Boolean, on: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(if (on) colors.brandSoft else colors.surface2)
            .border(1.dp, if (on) colors.brand else colors.border, RoundedCornerShape(50)).clickable(onClick = onClick)
            .padding(start = 4.dp, end = 12.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        MiniPin(mark, parking)
        Text(name, style = MaterialTheme.typography.labelLarge, color = colors.text)
        if (!placed) Text("not placed", style = MaterialTheme.typography.bodySmall, color = colors.muted)
    }
}

@Suppress("unused")
private fun List<Venue>.named() = this.map { it.name }

@Suppress("unused")
private val unusedItems: (androidx.compose.foundation.lazy.LazyListScope) -> Unit = { it.items(emptyList<String>()) {} }
