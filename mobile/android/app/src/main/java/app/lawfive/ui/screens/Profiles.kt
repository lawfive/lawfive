package app.lawfive.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.lawfive.ui.Together
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.Slab
import app.lawfive.ui.components.SlabFigure
import app.lawfive.ui.components.SlabLabel
import app.lawfive.ui.components.SlabRule
import app.lawfive.ui.sinceTag
import app.lawfive.ui.togetherOf
import app.lawfive.ui.theme.LfType
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lawfive.data.Collections
import app.lawfive.schema.Match
import app.lawfive.schema.Referee
import app.lawfive.schema.Venue
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.LocalNav
import app.lawfive.ui.components.Fact
import app.lawfive.ui.components.FactsCard
import app.lawfive.ui.components.Gap
import app.lawfive.ui.components.IconAction
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.ListRow
import app.lawfive.ui.components.LoadingPitch
import app.lawfive.ui.components.MapPin
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.Screen
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.components.SectionTitle
import app.lawfive.ui.components.Units
import app.lawfive.ui.components.VenueMap
import app.lawfive.ui.directionsUri
import app.lawfive.ui.formatShortDay
import app.lawfive.ui.instantOf
import app.lawfive.ui.theme.colors
import java.time.ZoneId

// A venue's and a referee's own pages (APP-4): what there is to know at a glance, with Edit for
// the form (VenueEditScreen, RefereeEditScreen), as a match has its page and its edit.

/** A venue: its map, Directions, pitches, tags and notes, the matches there, and photos. */
@Composable
fun VenueScreen(id: String) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val venue by remember(id) { graph.records.one(Collections.VENUES, id, Venue.serializer()) }.collectAsStateWithLifecycle(null)
    val mapsApp = app.lawfive.ui.rememberMapsApp()
    val matches by graph.records.matches.collectAsStateWithLifecycle(emptyList())
    val v = venue
    if (v == null) {
        Screen("Venue", back = "Venues") { item { LoadingPitch() } }
        return
    }
    val here = matches.filter { it.venueId == id }
    val list = rememberLazyListState()
    val rows = remember { Rows() }
    Screen(v.name, sub = listOfNotNull(v.aliases?.takeIf { it.isNotEmpty() }?.let { "Also ${it.joinToString(", ")}" }, v.address).joinToString(" · ").ifEmpty { null }, back = "Venues", label = "Venue · ${v.name}", actions = { IconAction(Ph.Edit, "Edit") { nav.navigate("venue/$id/edit") } }, state = list) {
        rows.count = 1
        row(rows) { DuplicateCard(app.lawfive.data.MergeKind.Venues, id) }
        // WEB-28: how much you've refereed here, on its slab.
        row(rows) {
            val pitches = v.pitches.size
            Box(Modifier.padding(top = 30.dp, bottom = 22.dp)) {
                TogetherSlab("At this venue", togetherOf(here), list, rows, extra = SlabCellFigure("Pitches", "$pitches", if (pitches == 0) "None yet" else "${v.pitches.count { it.position != null }} on the map"))
            }
        }
        val pins = listOfNotNull(v.position?.let { MapPin("parking", it.lat, it.lon, MapPin.Kind.Parking, "P") }) +
            v.pitches.mapIndexedNotNull { i, p -> p.position?.let { MapPin(p.id, it.lat, it.lon, MapPin.Kind.Pitch, "${i + 1}") } }
        if (pins.isNotEmpty()) row(rows) { VenueMap(pins, height = 220.dp); Gap() }
        val target = venuePosition(v)?.let { directionsUri(it.lat, it.lon, mapsApp) } ?: v.address?.let { directionsUri(it, mapsApp) }
        if (target != null) {
            row(rows) {
                SecondaryButton("Directions", { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(target))) }, icon = Ph.Directions)
            }
        }
        if (v.pitches.isNotEmpty()) {
            row(rows) { SectionTitle("Pitches") }
            row(rows) {
                LfCard {
                    v.pitches.forEachIndexed { i, p ->
                        // TRK-13: corners walked on the watch.
                        val walked = p.markings?.lastOrNull()?.let { last -> instantOf(last.at)?.let { "Corners walked ${formatShortDay(it.atZone(ZoneId.systemDefault()))}" } }
                        ListRow(
                            p.name,
                            listOfNotNull(if (p.position != null) "On the map" else "Not on the map yet", walked).joinToString(" · "),
                            leading = { MiniPin("${i + 1}", parking = false, size = 30.dp) },
                            divider = i > 0,
                        )
                    }
                }
            }
        }
        val facts = listOfNotNull(
            v.tags?.takeIf { it.isNotEmpty() }?.let { Fact(Ph.Tag, "Tags", it.joinToString(", "), wide = true) },
            v.notes?.let { Fact(Ph.Note, "Notes", it, wide = true) },
        )
        if (facts.isNotEmpty()) {
            row(rows) { SectionTitle("Details") }
            row(rows) { FactsCard(facts) }
        }
        rows.matches = rows.count
        row(rows) { MatchesWith("Matches here", here, "No matches here yet.") }
        row(rows) { Gap(16); PhotosSection("venue", id) }
    }
}

/** A referee: their picture and how to reach them, the matches you've worked together, and photos. */
@Composable
fun RefereeScreen(id: String) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val referee by remember(id) { graph.records.one(Collections.REFEREES, id, Referee.serializer()) }.collectAsStateWithLifecycle(null)
    val matches by graph.records.matches.collectAsStateWithLifecycle(emptyList())
    val pictures = rememberRefereePictures()
    val r = referee
    if (r == null) {
        Screen("Referee", back = "Referees") { item { LoadingPitch() } }
        return
    }
    val together = matches.filter { m -> m.crew.any { it.refereeId == id } }
    val list = rememberLazyListState()
    val rows = remember { Rows() }
    Screen(r.name, sub = r.aliases?.takeIf { it.isNotEmpty() }?.let { "Also ${it.joinToString(", ")}" }, back = "Referees", label = "Referee · ${r.name}",
        actions = { IconAction(Ph.Edit, "Edit") { nav.navigate("referee/$id/edit") } }, state = list) {
        rows.count = 1
        row(rows) { DuplicateCard(app.lawfive.data.MergeKind.Referees, id) }
        // WEB-28: their picture and how much you've worked together on a slab, then how to reach them.
        row(rows) {
            Box(Modifier.padding(top = 30.dp)) {
                TogetherSlab("Working together", togetherOf(together), list, rows, aside = { RefereeAvatar(r, pictures[r.id], size = 72.dp, tile = true) })
            }
        }
        if (r.phone != null || r.email != null) {
            row(rows) {
                FlowRow(Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    r.phone?.let { p ->
                        SecondaryButton("Call", { context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$p"))) }, icon = Ph.Phone)
                        SecondaryButton("Text", { context.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$p"))) }, icon = Ph.Message)
                    }
                    r.email?.let { e -> SecondaryButton("Email", { context.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$e"))) }, icon = Ph.Mail) }
                }
            }
        }
        val facts = listOfNotNull(
            r.phone?.let { Fact(Ph.Phone, "Phone", it) },
            r.email?.let { Fact(Ph.Mail, "Email", it, wide = true) },
            r.tags?.takeIf { it.isNotEmpty() }?.let { Fact(Ph.Tag, "Tags", it.joinToString(", "), wide = true) },
            r.notes?.let { Fact(Ph.Note, "Notes", it, wide = true) },
        )
        if (facts.isNotEmpty()) {
            row(rows) { SectionTitle("Details") }
            row(rows) { FactsCard(facts) }
        }
        rows.matches = rows.count
        row(rows) { MatchesWith("Matches together", together, "No matches together yet.") }
        row(rows) { Gap(16); PhotosSection("referee", id) }
    }
}

/** The page's rows as they're added, so See matches knows which row the matches are (the page head is the first). */
private class Rows {
    var count = 1
    var matches = 0
}

/** A row of the page, counted. */
private fun LazyListScope.row(rows: Rows, content: @Composable () -> Unit) {
    item { content() }
    rows.count++
}

/** A figure on a record's slab: a label, the figure and a line under it. */
private data class SlabCellFigure(val label: String, val value: String, val caption: String)

/**
 * WEB-28: how much you've worked with a referee or at a venue, as the website's: a slab cut on the
 * diagonal (At this venue, Working together) tagged since the first match played, with Played (and
 * the last), Coming up and any `extra` (a venue's pitches), two to a row where they fit and one
 * under another beside `aside` (a referee's picture); See matches along its foot scrolls to them
 * further down this page, where the phones list them.
 */
@Composable
private fun TogetherSlab(title: String, t: Together, list: LazyListState, rows: Rows, extra: SlabCellFigure? = null, aside: (@Composable () -> Unit)? = null) {
    val scope = rememberCoroutineScope()
    // The matches' heading lands clear of the board's band over the status bar.
    val clear = with(androidx.compose.ui.platform.LocalDensity.current) { WindowInsets.statusBars.getTop(this) + 12.dp.roundToPx() }
    val cells = listOfNotNull(
        // A date never breaks across lines.
        SlabCellFigure("Played", "${t.played}", t.last?.let { "Last ${formatShortDay(it).replace(' ', '\u00A0')}" } ?: "None yet"),
        SlabCellFigure("Coming up", "${t.upcoming}", when (t.upcoming) { 0 -> "Nothing yet"; 1 -> "1 match"; else -> "${t.upcoming} matches" }),
        extra,
    )
    Slab(title, tag = sinceTag(t), cut = true) {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val oneColumn = aside != null || maxWidth < 280.dp
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                if (aside != null) {
                    aside()
                    Box(Modifier.padding(start = 16.dp).width(2.dp).fillMaxHeight().background(colors.border))
                }
                Column(Modifier.weight(1f).padding(start = if (aside != null) 16.dp else 0.dp)) {
                    val lines = if (oneColumn) cells.map { listOf(it) } else cells.chunked(2)
                    lines.forEachIndexed { i, line ->
                        if (i > 0) SlabRule(Modifier.padding(vertical = 14.dp))
                        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                            line.forEachIndexed { j, cell ->
                                if (j > 0) Box(Modifier.padding(horizontal = 16.dp).width(2.dp).fillMaxHeight().background(colors.border))
                                // An odd last one goes across the slab.
                                TogetherCell(cell, Modifier.weight(1f))
                            }
                        }
                    }
                }
            }
        }
        if (t.played + t.upcoming > 0) {
            SlabRule(Modifier.padding(top = 18.dp))
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.End) {
                Row(
                    Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(4.dp))
                        .clickable(onClickLabel = "Go to the matches") { scope.launch { list.animateScrollToItem(rows.matches, -clear) } }.padding(horizontal = 4.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("SEE MATCHES", style = LfType.word(17.sp, colors.onBoardStrong))
                    PhIcon(Ph.Open, size = 16.dp, tint = colors.onBoardStrong)
                }
            }
        }
    }
}

@Composable
private fun TogetherCell(cell: SlabCellFigure, modifier: Modifier) {
    Column(modifier.semantics(mergeDescendants = true) {}) {
        SlabLabel(cell.label)
        SlabFigure(cell.value, 52.dp, Modifier.padding(top = 8.dp))
        Text(cell.caption, style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp, fontWeight = FontWeight.Medium), color = colors.muted, modifier = Modifier.padding(top = 6.dp))
    }
}

/** A few of the matches at a venue or with a referee: the next ones, then the latest. */
@Composable
private fun MatchesWith(title: String, matches: List<Match>, none: String) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val reports by graph.records.matchRecords.collectAsStateWithLifecycle(emptyList())
    val venues by graph.records.venues.collectAsStateWithLifecycle(emptyList())
    val competitions by graph.records.competitions.collectAsStateWithLifecycle(emptyList())
    val settings by graph.records.settingsOrDefaults.collectAsStateWithLifecycle(null)
    val weather by graph.weather.byMatch.collectAsStateWithLifecycle()
    val referees by graph.records.referees.collectAsStateWithLifecycle(emptyList())
    val refereeById = remember(referees) { referees.associateBy { it.id } }
    val units = Units(settings?.temperatureUnit ?: "c", settings?.distanceUnit ?: "km")
    val (upcoming, past) = matches.partition { isUpcoming(it) }
    val shown = (upcoming.sortedBy { it.kickoff ?: "9999" } + past.sortedByDescending { it.kickoff ?: "" }).take(SHOWN)
    SectionTitle(if (matches.isEmpty()) title else "$title (${matches.size})")
    if (shown.isEmpty()) {
        LfCard { Text(none, style = MaterialTheme.typography.bodyMedium, color = colors.muted, modifier = Modifier.padding(16.dp)) }
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        shown.forEach { m ->
            MatchRow(
                m, reports.firstOrNull { it.matchId == m.id }, venues.firstOrNull { it.id == m.venueId }?.name,
                competitions.firstOrNull { it.id == m.competitionId }?.name, weather[m.id], units, refereeById,
            ) { nav.navigate("match/${m.id}") }
        }
    }
    if (matches.size > SHOWN) {
        Text("And ${matches.size - SHOWN} more: search for them in Matches.", style = MaterialTheme.typography.bodySmall, color = colors.muted, modifier = Modifier.padding(top = 8.dp))
    }
}

private const val SHOWN = 5
