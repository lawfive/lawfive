package app.lawfive.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lawfive.data.ApiException
import app.lawfive.data.Collections
import app.lawfive.schema.CompetitionType
import app.lawfive.schema.CrewMember
import app.lawfive.schema.ExternalRef
import app.lawfive.schema.Fee
import app.lawfive.schema.Match
import app.lawfive.schema.MatchFormat
import app.lawfive.schema.MatchTemplate
import app.lawfive.schema.Referee
import app.lawfive.schema.Competition
import app.lawfive.schema.Venue
import app.lawfive.schema.Team
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.LocalNav
import app.lawfive.ui.teamAlias
import app.lawfive.ui.components.Choice
import app.lawfive.ui.components.Confirm
import app.lawfive.ui.components.Field
import app.lawfive.ui.components.FieldPair
import app.lawfive.ui.components.SuggestField
import app.lawfive.ui.components.TeamColorChoice
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.LoadingPitch
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.Screen
import app.lawfive.ui.components.UnsavedChanges
import app.lawfive.ui.components.SearchChoice
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.components.SectionTitle
import app.lawfive.ui.components.ToggleRow
import app.lawfive.ui.deleteMatchMessage
import app.lawfive.ui.formatTime
import app.lawfive.ui.genderNames
import app.lawfive.ui.kickoffAt
import app.lawfive.ui.roleNamesInFull
import app.lawfive.ui.theme.colors
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

// Adding and editing a match (APP-4), on the phone and offline: teams, kickoff, where, the
// competition and format, your role and the crew, the fee, and notes. Saved on the phone and sent
// when there's signal.

/** The watch's team colours (SET-14). */
val teamColours = listOf("#000000" to "Black", "#FFFFFF" to "White", "#D71920" to "Red", "#FF7A00" to "Orange", "#FFD100" to "Yellow",
    "#00A651" to "Green", "#0057B8" to "Blue", "#6A2C91" to "Purple")

private val statuses = listOf("scheduled" to "Scheduled", "played" to "Played", "abandoned" to "Abandoned", "cancelled" to "Canceled", "postponed" to "Postponed")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MatchEditScreen(id: String?) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val saved by remember(id) { if (id != null) graph.records.one(Collections.MATCHES, id, Match.serializer()) else kotlinx.coroutines.flow.flowOf(null) }
        .collectAsStateWithLifecycle(null)
    val venues by graph.records.venues.collectAsStateWithLifecycle(emptyList())
    val competitions by graph.records.competitions.collectAsStateWithLifecycle(emptyList())
    val loadedTemplates by graph.records.templates.collectAsStateWithLifecycle(null)
    val templates = loadedTemplates ?: emptyList()
    val referees by graph.records.referees.collectAsStateWithLifecycle(emptyList())
    val settings by graph.records.settingsOrDefaults.collectAsStateWithLifecycle(null)
    val allMatches by graph.records.matches.collectAsStateWithLifecycle(emptyList())
    val assignors = remember(allMatches) { allMatches.mapNotNull { it.assignor }.distinct().sortedBy { it.lowercase() } }
    // RES-8: deleting the match takes its report and track, so Delete match? says so, as the website
    // does. Whether it has a track: null until the server says (or offline).
    val reports by graph.records.matchRecords.collectAsStateWithLifecycle(emptyList())
    val report = reports.firstOrNull { id != null && it.matchId == id }
    var hasTrack by remember(report?.id) { mutableStateOf<Boolean?>(null) }
    LaunchedEffect(report?.id) {
        val r = report ?: return@LaunchedEffect
        try {
            hasTrack = graph.api.call("GET", "/v1/match-records/${r.id}/track") != null
        } catch (e: ApiException) {
            if (e.status == 404) hasTrack = false
        } catch (_: Exception) {
            // Offline: "and any track".
        }
    }
    // A new match starts from the account's usual role and format (SET-17), so it waits for them.
    if ((id != null && saved == null) || (id == null && (settings == null || loadedTemplates == null))) {
        Screen(if (id == null) "New match" else "Match", back = "Matches") { item { LoadingPitch() } }
        return
    }
    val recordId = remember(saved?.id) { saved?.id ?: newId() }
    var m by remember(saved?.id) {
        mutableStateOf(saved ?: run {
            // SET-17: the usual role (Referee until chosen) and the usual format (2×45 until one's saved).
            val (format, templateId) = app.lawfive.data.startingFormat(settings?.usualFormat, templates)
            Match(
                id = recordId, version = 0, updatedAt = now(), status = "scheduled", format = format, templateId = templateId,
                role = settings?.usualRole ?: "referee",
                home = Team(), away = Team(), crew = emptyList(), timeZone = ZoneId.systemDefault().id,
            )
        })
    }
    var newVenueName by remember { mutableStateOf<String?>(null) }
    var feeText by remember(saved?.id) { mutableStateOf(m.fee?.amount?.let { if (it % 1.0 == 0.0) "${it.toLong()}" else "$it" } ?: "") }
    var tagsText by remember(saved?.id) { mutableStateOf(m.tags?.joinToString(", ") ?: "") }
    var picking by remember { mutableStateOf<String?>(null) }
    var deleting by remember { mutableStateOf(false) }
    val state = listOf(m, feeText, tagsText)
    val start = remember(saved?.id) { state }
    UnsavedChanges(state != start) // APP-18
    val zone = m.timeZone?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.systemDefault()
    val kickoff = kickoffAt(m)
    // WEB-30, as the website: a match needs a team or a kickoff; one saved without either before can still be edited.
    var blankTried by remember(saved?.id) { mutableStateOf(false) }
    val mayBeBlank = remember(saved?.id) { saved != null && isBlankMatch(saved!!) }
    val blank = isBlankMatch(m) && !mayBeBlank

    // APP-22: made from what's typed, without leaving this form. The rest can be filled in on its own page.
    suspend fun newVenue(name: String): Venue = Venue(id = newId(), version = 0, updatedAt = now(), name = name, pitches = emptyList())
        .also { graph.records.save(Collections.VENUES, it.id, Venue.serializer(), it) }
    suspend fun newCompetition(name: String): Competition = Competition(id = newId(), version = 0, updatedAt = now(), name = name, type = CompetitionType.LEAGUE)
        .also { graph.records.save(Collections.COMPETITIONS, it.id, Competition.serializer(), it) }
    suspend fun newReferee(name: String): Referee = Referee(id = newId(), version = 0, updatedAt = now(), name = name)
        .also { graph.records.save(Collections.REFEREES, it.id, Referee.serializer(), it) }

    fun setKickoff(date: LocalDate?, time: LocalTime?) {
        val d = date ?: kickoff?.toLocalDate() ?: java.time.LocalDate.now(app.lawfive.data.AppClock.clock())
        val t = time ?: kickoff?.toLocalTime() ?: LocalTime.of(9, 0)
        m = m.copy(kickoff = ZonedDateTime.of(d, t, zone).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME))
    }

    Screen(if (id == null) "New match" else "Edit match", back = if (id == null) "Matches" else "Match",
        bottomBar = {
            FormActions(
                canSave = true,
                message = if (blankTried && blank) BLANK_MATCH else null,
                onSave = {
                    if (blank) {
                        blankTried = true
                        return@FormActions
                    }
                    scope.launch {
                        val amount = feeText.toDoubleOrNull()
                        val fee = amount?.let { Fee(it, m.fee?.currency ?: settings?.currency ?: "USD", m.fee?.paid ?: false) }
                        val tags = tagsText.split(",").mapNotNull { it.orNull() }.ifEmpty { null }
                        val match = m.copy(
                            fee = fee, tags = tags,
                            home = m.home.copy(name = m.home.name?.trim()?.ifEmpty { null }, alias = m.home.alias?.trim()?.uppercase()?.ifEmpty { null }),
                            away = m.away.copy(name = m.away.name?.trim()?.ifEmpty { null }, alias = m.away.alias?.trim()?.uppercase()?.ifEmpty { null }),
                            crew = m.crew.filter { it.refereeId != null || !it.name.isNullOrBlank() },
                            assignor = m.assignor?.trim()?.ifEmpty { null },
                        )
                        graph.records.save(Collections.MATCHES, recordId, Match.serializer(), match)
                        // SET-17: the next new match starts with this one's format.
                        // SET-17: a new match saved from the form makes its format the usual one, when that changes anything.
                        val usual = app.lawfive.data.usualFormatFrom(match.format, app.lawfive.data.formatChoiceOf(match.format, match.templateId, settings?.usualFormat, templates), now())
                        if (id == null && app.lawfive.data.usualChanged(settings?.usualFormat, usual)) graph.records.saveSettings { it.copy(usualFormat = usual) }
                        nav.popBackStack()
                        if (id == null) nav.navigate("match/$recordId")
                    }
                },
                deleteLabel = if (id != null) "Delete match" else null,
                onDelete = { deleting = true },
            )
        },
    ) {
        item { SectionTitle("Teams") }
        item {
            LfCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    TeamFields("Home", m.home, m.away) { m = m.copy(home = it) }
                    HorizontalDivider(color = colors.border)
                    TeamFields("Away", m.away, m.home) { m = m.copy(away = it) }
                    // WEB-24: the kits as the match's boards will show them, following what's typed.
                    app.lawfive.ui.components.Board(Modifier.padding(top = 4.dp), shadow = false) {
                        app.lawfive.ui.components.KitPanels(m.home, m.away, size = app.lawfive.ui.components.KitSize.Small, lines = 1)
                    }
                }
            }
        }
        item { SectionTitle("When and where") }
        item {
            LfCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Tappable(Modifier.weight(1.3f), { picking = "date" }) { Field("Date", kickoff?.let(::formDate) ?: "", {}) }
                        Tappable(Modifier.weight(1f), { picking = "time" }) { Field("Time", kickoff?.let { formatTime(it, context) } ?: "", {}) }
                    }
                    // SET-17: the format beside the kickoff: the usual one, the starters and the templates; the details are under Format below.
                    FormatPicker(m, settings?.usualFormat, templates) { format, template ->
                        m = m.copy(format = format, templateId = template?.id)
                        if (feeText.isEmpty()) template?.defaults?.fee?.let { feeText = "${it.amount}" }
                    }
                    Choice("Status", m.status, statuses.map { it.first }, { s -> statuses.firstOrNull { it.first == s }?.second ?: "" }, { m = m.copy(status = it ?: "scheduled") })
                    val venue = venues.firstOrNull { it.id == m.venueId }
                    // WEB-12: a new venue asks for its address, looked up and placed, so the match has its forecast and directions.
                    SearchChoice("Venue", venue, venues.sortedBy { it.name.lowercase() }, { it.name }, { m = m.copy(venueId = it?.id, pitchId = null) }, createLabel = "New venue", onCreateAsk = { newVenueName = it }, otherNames = { it.aliases ?: emptyList() })
                    if (venue != null && venue.pitches.isNotEmpty()) {
                        Choice("Pitch", venue.pitches.firstOrNull { it.id == m.pitchId }, venue.pitches, { it?.name ?: "None" }, { m = m.copy(pitchId = it?.id) }, allowNone = "None")
                    }
                    SearchChoice("Competition", competitions.firstOrNull { it.id == m.competitionId }, competitions.sortedBy { it.name.lowercase() }, { it.name }, { c ->
                        // A competition's template fills the format, as on the website.
                        val template = c?.templateId?.let { t -> templates.firstOrNull { it.id == t } }
                        m = m.copy(competitionId = c?.id, ageGroup = m.ageGroup ?: c?.ageGroup, templateId = template?.id ?: m.templateId, format = template?.format ?: m.format)
                    }, createLabel = "New competition", onCreate = ::newCompetition)
                    // SET-17: the age group suggests its starter, under Format above. APP-25: stacked on a narrow phone or at large text.
                    FieldPair(
                        { mod -> Field("Age group", m.ageGroup ?: "", { m = m.copy(ageGroup = it.ifEmpty { null }) }, mod, placeholder = "U12") },
                        { mod -> Choice("Gender", m.gender, genderNames.keys.toList(), { genderNames[it] ?: "—" }, { m = m.copy(gender = it) }, mod, allowNone = "—") },
                    )
                }
            }
        }
        // WEB-21: what the match is called and filed under.
        item { SectionTitle("Details") }
        item {
            LfCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Field("Match name", m.name ?: "", { m = m.copy(name = it.ifEmpty { null }) }, placeholder = "Semi-final")
                    Field("Match number", m.external?.id ?: "", { m = m.copy(external = it.ifEmpty { null }?.let { n -> ExternalRef(source = m.external?.source ?: "manual", id = n) }) })
                    // SET-15: the ones on other matches offered as it's typed.
                    SuggestField("Assignor", m.assignor ?: "", { m = m.copy(assignor = it.ifEmpty { null }) }, assignors)
                    Field("Tags", tagsText, { tagsText = it }, supporting = "Separated by commas")
                }
            }
        }
        item { SectionTitle("Officials") }
        item {
            LfCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Choice("Your role", m.role, roleNamesInFull.keys.toList(), { roleNamesInFull[it] ?: "Not set" }, { m = m.copy(role = it) }, allowNone = "Not set")
                    for ((i, c) in m.crew.withIndex()) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Choice("Role", c.role, roleNamesInFull.keys.toList(), { roleNamesInFull[it] ?: "" }, { r -> m = m.copy(crew = m.crew.mapIndexed { j, x -> if (j == i) x.copy(role = r ?: x.role) else x }) }, Modifier.weight(1f))
                            SearchChoice("Referee", referees.firstOrNull { it.id == c.refereeId }, referees.sortedBy { it.name.lowercase() }, { it.name },
                                { r -> m = m.copy(crew = m.crew.mapIndexed { j, x -> if (j == i) x.copy(refereeId = r?.id, name = if (r == null) x.name else null) else x }) },
                                Modifier.weight(1.5f), empty = c.name ?: "Choose", allowNone = false, otherNames = { it.aliases ?: emptyList() },
                                createLabel = "New referee", onCreate = ::newReferee, textLabel = "Just this match:",
                                onUseText = { typed -> m = m.copy(crew = m.crew.mapIndexed { j, x -> if (j == i) x.copy(refereeId = null, name = typed) else x }) })
                            androidx.compose.material3.IconButton({ m = m.copy(crew = m.crew.filterIndexed { j, _ -> j != i }) }, Modifier.padding(top = 8.dp)) { PhIcon(Ph.Close, "Remove", tint = colors.muted) }
                        }
                    }
                    SecondaryButton("Add an official", {
                        val taken = m.crew.map { it.role } + listOfNotNull(m.role)
                        m = m.copy(crew = m.crew + CrewMember(role = listOf("referee", "ar1", "ar2", "fourth").firstOrNull { it !in taken } ?: "ar1"))
                    }, icon = Ph.Plus)
                }
            }
        }
        // The format in full, chosen beside the kickoff (SET-17), saying where it came from, as the website's.
        item { SectionTitle("Format") }
        item {
            val choice = app.lawfive.data.formatChoiceOf(m.format, m.templateId, settings?.usualFormat, templates)
            val template = choice.template?.takeIf { it.id == m.templateId }
            val competition = template?.let { t -> competitions.firstOrNull { it.id == m.competitionId && it.templateId == t.id } }
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    when {
                        template != null -> "From ${competition?.let { "${it.name} (${template.name})" } ?: "the template ${template.name}"}. Changes here apply to this match only."
                        choice.id == "none" -> "Your own, for this match."
                        else -> "${choice.name}. Changes here apply to this match only."
                    },
                    style = androidx.compose.material3.MaterialTheme.typography.bodyMedium, color = colors.muted,
                )
                FormatFields(m.format) { m = m.copy(format = it) }
            }
        }
        item { SectionTitle("Fee and notes") }
        item {
            LfCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Field("Fee (${m.fee?.currency ?: settings?.currency ?: "USD"})", feeText, { feeText = it.filter { c -> c.isDigit() || c == '.' } }, keyboard = KeyboardType.Decimal)
                    Field("What to expect", m.outlook ?: "", { m = m.copy(outlook = it.ifEmpty { null }) }, singleLine = false, minLines = 2,
                        placeholder = "Top of the table meets second.", supporting = "How competitive it'll be, the teams' strengths, history between them.")
                    Field("Notes", m.notes ?: "", { m = m.copy(notes = it.ifEmpty { null }) }, singleLine = false, minLines = 3)
                }
                if (feeText.toDoubleOrNull() != null) {
                    ToggleRow("Paid", null, m.fee?.paid == true, { paid -> m = m.copy(fee = Fee(feeText.toDouble(), m.fee?.currency ?: settings?.currency ?: "USD", paid)) })
                }
            }
        }
    }

    app.lawfive.ui.theme.OnPanel { when (picking) {
        "date" -> {
            val state = rememberDatePickerState(initialSelectedDateMillis = (kickoff?.toLocalDate() ?: java.time.LocalDate.now(app.lawfive.data.AppClock.clock())).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
            DatePickerDialog(
                onDismissRequest = { picking = null },
                confirmButton = {
                    TextButton({ state.selectedDateMillis?.let { setKickoff(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate(), null) }; picking = null }) { Text("OK", color = colors.brand) }
                },
                colors = androidx.compose.material3.DatePickerDefaults.colors(containerColor = colors.surface),
                dismissButton = { TextButton({ picking = null }) { Text("Cancel", color = colors.muted) } },
            ) {
                // No typing mode: its toggle is Material's pencil, not a Phosphor icon (DESIGN.md).
                DatePicker(state, showModeToggle = false)
            }
        }
        "time" -> {
            val state = rememberTimePickerState(kickoff?.hour ?: 9, kickoff?.minute ?: 0, android.text.format.DateFormat.is24HourFormat(context))
            Dialog({ picking = null }) {
                LfCard {
                    Column(Modifier.padding(20.dp)) {
                        TimePicker(state)
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                            TextButton({ picking = null }) { Text("Cancel", color = colors.muted) }
                            TextButton({ setKickoff(null, LocalTime.of(state.hour, state.minute)); picking = null }) { Text("OK", color = colors.brand) }
                        }
                    }
                }
            }
        }
    } }
    newVenueName?.let { typed ->
        NewVenueDialog(typed, onDismiss = { newVenueName = null }) { venue ->
            newVenueName = null
            m = m.copy(venueId = venue.id, pitchId = null)
        }
    }
    if (deleting) {
        Confirm("Delete match?", deleteMatchMessage(report != null, hasTrack), "Delete", onConfirm = {
            deleting = false
            scope.launch {
                graph.records.delete(Collections.MATCHES, recordId)
                nav.popBackStack("matches", false)
            }
        }, onDismiss = { deleting = false })
    }
}

@Composable
private fun TeamFields(label: String, team: Team, other: Team, onChange: (Team) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Field(label, team.name ?: "", { onChange(team.copy(name = it.ifEmpty { null })) })
        // APP-25: stacked on a narrow phone or at large text, so neither label wraps.
        FieldPair(
            { mod -> Field("Short name", team.alias ?: "", { onChange(team.copy(alias = it.take(4).ifEmpty { null })) }, mod, placeholder = teamAlias(team.copy(alias = null), other, label == "Home")) },
            { mod -> TeamColorChoice(team, other, label == "Home", teamColours, { onChange(team.copy(colour = it)) }, mod) },
        )
    }
}

/** SET-17: a choice for the format, as the picker shows it. */
private data class FormatOption(val id: String, val label: String, val format: MatchFormat, val template: MatchTemplate? = null)

/**
 * SET-17: the format beside the kickoff, as the website's: Your usual (when it's none of the named
 * ones), the starter formats, then the templates; the field naming which the match's format is. The
 * line under it keeps its place: the format in words, or the starter the age group suggests, with Use it.
 */
@Composable
private fun FormatPicker(m: Match, usual: app.lawfive.schema.UsualFormat?, templates: List<MatchTemplate>, onChange: (MatchFormat, MatchTemplate?) -> Unit) {
    val choice = app.lawfive.data.formatChoiceOf(m.format, m.templateId, usual, templates)
    val usualChoice = usual?.let { app.lawfive.data.usualFormatChoice(it, templates) }
    val options = listOfNotNull(if (usualChoice?.id == "last") FormatOption("last", "Your usual", usual.format) else null) +
        app.lawfive.data.starterFormats.map { FormatOption("starter:${it.id}", it.name, it.format) }
    val own = templates.sortedBy { it.name.lowercase() }
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Choice("Format", FormatOption(choice.id, choice.name, m.format, choice.template), options, { it?.label ?: choice.name }, { o -> if (o != null && o.id != choice.id) onChange(o.format, o.template) },
            // The templates under their own label, as the website marks each "Your template".
            extra = if (own.isEmpty()) null else { close ->
                Text("YOUR TEMPLATES", style = androidx.compose.material3.MaterialTheme.typography.titleSmall, color = colors.muted, modifier = Modifier.padding(start = 12.dp, top = 10.dp, bottom = 4.dp))
                for (t in own) androidx.compose.material3.DropdownMenuItem({ Text(t.name) }, { close(); if (t.id != choice.template?.id) onChange(t.format, t) })
            })
        val suggestion = app.lawfive.data.suggestedStarter(m.ageGroup, m.format)
        Row(Modifier.fillMaxWidth().padding(start = 4.dp).heightIn(min = 36.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            if (suggestion != null) {
                Text("For ${m.ageGroup?.trim()}: ${suggestion.name}", style = androidx.compose.material3.MaterialTheme.typography.bodySmall, color = colors.muted, modifier = Modifier.weight(1f, fill = false))
                app.lawfive.ui.components.LinkButton("Use it") { onChange(suggestion.format, null) }
            } else {
                Text(app.lawfive.ui.describeFormat(m.format), style = androidx.compose.material3.MaterialTheme.typography.bodySmall, color = colors.muted)
            }
        }
    }
}

/**
 * WEB-12: a venue made from the match form, as the website's: its name and address, the address
 * looked up and the venue placed on the map (Find on map, or when Create is pressed), so the match
 * gets its forecast and directions from the start. With several places Create waits for a choice;
 * with none, it can still be made, and placed from Venues.
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun NewVenueDialog(typed: String, onDismiss: () -> Unit, onCreated: (Venue) -> Unit) {
    val graph = LocalGraph.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(typed) }
    var address by remember { mutableStateOf("") }
    var placed by remember { mutableStateOf<app.lawfive.schema.Place?>(null) }
    // The address last looked up, so Create doesn't look the same one up twice.
    var searched by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    fun create(place: app.lawfive.schema.Place?) {
        if (saving) return
        saving = true
        scope.launch {
            val venue = Venue(id = newId(), version = 0, updatedAt = now(), name = name.trim(), address = address.orNull(), pitches = emptyList(),
                position = place?.let { app.lawfive.schema.Position(it.lat, it.lon) })
            graph.records.save(Collections.VENUES, venue.id, Venue.serializer(), venue)
            onCreated(venue)
        }
    }
    // Create pressed while the search had several places: choosing one creates the venue.
    var creating by remember { mutableStateOf(false) }
    val search = app.lawfive.ui.components.rememberAddressLookUp { p ->
        placed = p
        if (creating) create(p)
    }
    val trimmed = address.trim()
    val unplaced = trimmed.isNotEmpty() && placed == null && searched == trimmed && !search.looking
    val dirty = name != typed || address.isNotEmpty()
    app.lawfive.ui.theme.OnPanel {
        Dialog({ if (!dirty && !saving) onDismiss() }) {
            Column(
                Modifier.fillMaxWidth().background(colors.surface, RoundedCornerShape(6.dp))
                    .then(if (colors.dark) Modifier.border(1.dp, colors.panelEdge, RoundedCornerShape(6.dp)) else Modifier)
                    .verticalScroll(rememberScrollState()).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("NEW VENUE", style = androidx.compose.material3.MaterialTheme.typography.headlineSmall, color = colors.text)
                Field("Name", name, { name = it })
                Field("Address", address, {
                    address = it
                    placed = null
                    creating = false
                    search.clear()
                }, supporting = "Usually where you park. It's looked up and the venue placed on the map, for the match's forecast and directions. Place the pitches themselves from Venues.")
                if (search.available) {
                    SecondaryButton(if (search.looking) "Looking…" else "Find on map", {
                        searched = trimmed
                        scope.launch { search.lookUp(trimmed) }
                    }, icon = Ph.Search, enabled = trimmed.isNotEmpty() && !search.looking)
                }
                placed?.let { p ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        PhIcon(Ph.Check, size = 18.dp, tint = colors.brand)
                        Text("On the map at ${p.name}", style = androidx.compose.material3.MaterialTheme.typography.bodyMedium, color = colors.text)
                    }
                }
                app.lawfive.ui.components.FoundPlaces(search, "Create it anyway, and place it from Venues.")
                // "Create without the map" goes under Cancel where both don't fit.
                androidx.compose.foundation.layout.FlowRow(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp, androidx.compose.ui.Alignment.End), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    SecondaryButton("Cancel", onDismiss, enabled = !saving)
                    app.lawfive.ui.components.PrimaryButton(
                        if (search.looking) "Looking…" else if (saving) "Saving…" else if (unplaced) "Create without the map" else "Create",
                        {
                            if (search.available && trimmed.isNotEmpty() && placed == null && searched != trimmed) {
                                // Looked up first, as Find on map would be: one place is used straight away; with several,
                                // choosing one creates it; with none, Create again makes it unplaced.
                                searched = trimmed
                                scope.launch { search.lookUp(trimmed)?.let { create(it) } ?: run { creating = true } }
                            } else create(placed)
                        },
                        enabled = name.isNotBlank() && !search.looking && !saving,
                    )
                }
            }
        }
    }
}

/** A read-only field that opens a picker when tapped. */
@Composable
private fun Tappable(modifier: Modifier, onClick: () -> Unit, content: @Composable () -> Unit) {
    Box(modifier) {
        content()
        Box(Modifier.matchParentSize().padding(top = 8.dp).clickable(onClick = onClick))
    }
}

/** WEB-30: what Save says to a match with no team and no kickoff, the same on the website and both phones. */
const val BLANK_MATCH = "Add a team name or a kickoff time to save this match."

/** No team named and no kickoff: nothing to know the match by (WEB-30). */
fun isBlankMatch(m: Match): Boolean = m.home.name.isNullOrBlank() && m.away.name.isNullOrBlank() && m.kickoff == null

/** The form's date in the phone's own order and words: "Sat, Nov 14, 2026" in the US, "Sat 14 Nov 2026" in the UK. */
fun formDate(t: java.time.temporal.TemporalAccessor, locale: java.util.Locale = java.util.Locale.getDefault()): String =
    DateTimeFormatter.ofPattern(android.text.format.DateFormat.getBestDateTimePattern(locale, "EEEMMMdyyyy"), locale).format(t)
