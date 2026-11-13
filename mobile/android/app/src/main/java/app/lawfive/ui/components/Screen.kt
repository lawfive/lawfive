package app.lawfive.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.lawfive.ui.LocalNav
import app.lawfive.ui.theme.colors
import app.lawfive.ui.theme.LfType
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.ui.semantics.selectableGroup
import androidx.compose.ui.semantics.semantics

// A screen's frame (DESIGN.md "Page head"): an optional back link, the title in Barlow Condensed,
// a muted line, actions on the right (with a short status beside them), the add button floating at
// the bottom right, then the content scrolling under it, pulled down to sync; and the form fields.

/** Where a page keeps its name for the next page's back link (WEB-16). */
private const val BACK_LABEL = "lawfive.backLabel"

/** Pull to refresh (APP-3): whether it's refreshing, what a pull does, and whether one just worked (a check by the status). */
class Refresh(val refreshing: Boolean, val done: Boolean = false, val onRefresh: () -> Unit)

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun Screen(
    title: String,
    sub: String? = null,
    back: String? = null,
    /** How a back link from the page after this one names it (WEB-16): "Match · Strikers U12 v Rovers U12"; the title when null. */
    label: String? = null,
    actions: (@Composable RowScope.() -> Unit)? = null,
    /** A short status left of the actions, right-aligned (how sync stands), one or two lines. */
    status: String? = null,
    /** The add button's words (for screen readers) and what it does: a chalk slab at the bottom right. */
    add: Pair<String, () -> Unit>? = null,
    /** Pulling the page down (APP-3): a sync, on a tab's first page and a match's. */
    refresh: Refresh? = null,
    /** A form's Delete, Cancel and Save, fixed at the bottom above the tabs (APP-25). */
    bottomBar: (@Composable () -> Unit)? = null,
    /** A core page's title (Matches, Stats): the hero, larger, with its offset (WEB-24). */
    hero: Boolean = false,
    /** The list's scroll, for a page that moves it itself (Stats' In detail links). */
    state: androidx.compose.foundation.lazy.LazyListState? = null,
    content: LazyListScope.() -> Unit,
) {
    val nav = LocalNav.current
    val guard = LocalLeaveGuard.current
    // WEB-16: each page leaves its name for the page after it, so a back link names where it goes
    // ("Referees" from the list, "Match · …" from a match); the `back` given is for a first page.
    val entry = androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner.current as? androidx.navigation.NavBackStackEntry
    val named = label ?: title
    androidx.compose.runtime.SideEffect { entry?.savedStateHandle?.set(BACK_LABEL, named) }
    val stack by nav.currentBackStack.collectAsState()
    val behind = entry?.let { e -> stack.getOrNull(stack.indexOfFirst { it.id == e.id } - 1) }
    val backLabel = back?.let { behind?.savedStateHandle?.get<String>(BACK_LABEL) ?: it }
    val pull = rememberPullToRefreshState()
    val list = state ?: androidx.compose.foundation.lazy.rememberLazyListState()
    val c = colors
    val frameTop = 6.dp
    // The page's rows, under the pull indicator when the page can be pulled (APP-3), between the
    // pitch frame's touchlines (WEB-24).
    val rows: @Composable () -> Unit = {
        LazyColumn(
            Modifier.fillMaxSize().pitchFrame(list, c.chalkLine, frameTop + androidx.compose.foundation.layout.WindowInsets.statusBars.asPaddingValues().calculateTopPadding(), FRAME_END, foot = if (add != null) 88.dp else if (bottomBar != null) 84.dp else 12.dp),
            state = list,
            // Room at the end for the add button, so it never covers the last row.
            contentPadding = PaddingValues(start = PagePad, end = PagePad, bottom = if (add != null) 88.dp else if (bottomBar != null) 84.dp else 16.dp),
        ) {
            item {
                Column(Modifier.statusBarsPadding().padding(top = frameTop + 18.dp)) {
                    if (back != null) {
                        Row(
                            Modifier.clip(RoundedCornerShape(4.dp)).clickable { guard.leave { nav.popBackStack() } }.padding(vertical = 6.dp, horizontal = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            PhIcon(Ph.Back, size = 16.dp, tint = colors.text)
                            Text((backLabel ?: back).uppercase(), style = LfType.word(16.sp, colors.text), modifier = Modifier.padding(start = 6.dp), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    Row(Modifier.fillMaxWidth().padding(top = if (back == null) 4.dp else 6.dp, bottom = 18.dp), verticalAlignment = Alignment.Bottom) {
                        Column(Modifier.weight(1f)) {
                            PageTitle(title, hero)
                            if (sub != null) Text(sub, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Medium), color = colors.muted, modifier = Modifier.padding(top = 8.dp))
                        }
                        if (status != null) {
                            // At the right, by the title: two short lines at most fit its height, so a
                            // longer status (something waiting) doesn't move the page. A pull that worked
                            // shows a check by it for a moment (APP-3).
                            val done = refresh?.done == true
                            val tint by animateColorAsState(if (done) colors.brandStrong else colors.muted, label = "status")
                            Row(Modifier.padding(start = 12.dp, end = if (actions != null) 10.dp else 0.dp, bottom = 6.dp).widthIn(max = 150.dp), verticalAlignment = Alignment.CenterVertically) {
                                AnimatedVisibility(done, enter = fadeIn() + scaleIn(initialScale = 0.4f), exit = fadeOut()) {
                                    PhIcon(Ph.Check, size = 14.dp, tint = colors.brandStrong, modifier = Modifier.padding(end = 4.dp))
                                }
                                Text(status, style = MaterialTheme.typography.bodySmall, color = tint, textAlign = TextAlign.End, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            }
                        }
                        if (actions != null) Row(Modifier.padding(bottom = 2.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically, content = actions)
                    }
                }
            }
            content()
            // The frame's bottom goal line sits under the last row, with room inside it.
            item(key = FRAME_END) { Spacer(Modifier.fillMaxWidth().height(28.dp)) }
        }
    }
    Box(Modifier.fillMaxSize().pitchStripes(c.pitch, c.pitchStripe)) {
        if (refresh == null) {
            rows()
        } else {
            PullToRefreshBox(
                isRefreshing = refresh.refreshing,
                onRefresh = refresh.onRefresh,
                state = pull,
                modifier = Modifier.fillMaxSize(),
                indicator = {
                    PullToRefreshDefaults.Indicator(
                        state = pull, isRefreshing = refresh.refreshing, containerColor = colors.board, color = colors.onBoard,
                        modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding(),
                    )
                },
            ) { rows() }
        }
        // APP-25: a strip of the board along the page's foot, over its last rows, which have room left
        // for it. Not while the keyboard is up, as it would ride up over the field being typed in; the
        // back key still leaves.
        if (bottomBar != null && !WindowInsets.isImeVisible) {
            app.lawfive.ui.theme.OnBoard {
                Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(colors.board)) {
                    Box(Modifier.fillMaxWidth().height(1.dp).background(if (colors.dark) colors.boardEdge else colors.boardRule))
                    Box(Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) { bottomBar() }
                }
            }
        }
        // Not while the keyboard is up: it would ride up over the field being typed in. The grass's
        // primary button: a chalk slab with board words and a hard drop.
        if (add != null && !WindowInsets.isImeVisible) {
            val shape = RoundedCornerShape(6.dp)
            FloatingActionButton(
                onClick = add.second,
                modifier = Modifier.align(Alignment.BottomEnd).padding(end = 18.dp, bottom = 18.dp).hardDrop(colors.board, shape),
                shape = shape,
                containerColor = colors.chalk,
                contentColor = colors.board,
                elevation = FloatingActionButtonDefaults.elevation(defaultElevation = 0.dp, pressedElevation = 0.dp, focusedElevation = 0.dp, hoveredElevation = 0.dp),
            ) {
                PhIcon(Ph.Plus, add.first, size = 26.dp, tint = colors.board)
            }
        }
    }
}

private const val FRAME_END = "lawfive.frameEnd"

/**
 * A page's title (DESIGN.md "Page head"): black italic capitals in chalk with the hard offset under
 * them, dark green by day and mint at night; a core page's (`hero`) larger, a long one a step smaller.
 */
@Composable
fun PageTitle(title: String, hero: Boolean = false) {
    val c = colors
    val size = when {
        hero -> if (title.length > 8) 52.sp else 64.sp
        title.length > 18 -> 32.sp
        else -> 40.sp
    }
    val density = androidx.compose.ui.platform.LocalDensity.current
    // By day 0.035 em, which scales with the type; at night the mint, 3 by 2 (hero) or 2 by 2.
    val offset = with(density) {
        if (!c.dark) androidx.compose.ui.geometry.Offset(size.toPx() * 0.035f, size.toPx() * 0.035f)
        else if (hero) androidx.compose.ui.geometry.Offset(3.dp.toPx(), 2.dp.toPx()) else androidx.compose.ui.geometry.Offset(2.dp.toPx(), 2.dp.toPx())
    }
    androidx.compose.foundation.layout.BoxWithConstraints {
        // A word never breaks: the size steps down until the longest word fits the room there is.
        val measurer = androidx.compose.ui.text.rememberTextMeasurer()
        val longest = title.uppercase().split(" ").filter { it.isNotEmpty() }
        val room = constraints.maxWidth - with(density) { 8.dp.roundToPx() }
        var fitted = size
        while (fitted > 24.sp && longest.any { measurer.measure(it, LfType.display(fitted)).size.width > room }) fitted *= 0.92f
        Text(
            title.uppercase(),
            style = LfType.display(fitted, c.text, fitted * 0.9f).copy(shadow = androidx.compose.ui.graphics.Shadow(c.heroShadow, if (fitted < size) offset * (fitted.value / size.value) else offset, 0f)),
            maxLines = 3, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(end = 4.dp),
        )
    }
}

/** An icon-only button (Edit, Share…). */
@Composable
fun IconAction(icon: Ph, description: String, onClick: () -> Unit) {
    IconButton(onClick, Modifier.clip(RoundedCornerShape(6.dp)).background(colors.field).border(2.dp, colors.borderInput, RoundedCornerShape(6.dp))) {
        PhIcon(icon, description, size = 20.dp, tint = colors.text)
    }
}

@Composable
fun Field(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    keyboard: KeyboardType = KeyboardType.Text,
    password: Boolean = false,
    singleLine: Boolean = true,
    minLines: Int = 1,
    supporting: String? = null,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
    /** Typed in JetBrains Mono: codes read character by character (DESIGN.md "Code"). */
    mono: Boolean = false,
    visual: VisualTransformation = VisualTransformation.None,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        modifier = modifier.fillMaxWidth(),
        textStyle = if (mono) MaterialTheme.typography.bodyLarge.copy(fontFamily = app.lawfive.ui.theme.Mono, letterSpacing = 1.sp) else MaterialTheme.typography.bodyLarge,
        // A field in a row that says what it is (a result's Goal or Caution) has no label of its own.
        label = if (label.isEmpty()) null else { { Text(label) } },
        placeholder = placeholder?.let { { Text(it, color = colors.muted) } },
        singleLine = singleLine,
        minLines = minLines,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
        visualTransformation = if (password) PasswordVisualTransformation() else visual,
        supportingText = supporting?.let { { Text(it) } },
        leadingIcon = leading,
        trailingIcon = trailing,
        shape = RoundedCornerShape(6.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = colors.brand, unfocusedBorderColor = colors.borderInput, focusedLabelColor = colors.brand, unfocusedLabelColor = colors.muted,
            focusedTextColor = colors.text, unfocusedTextColor = colors.text, focusedLeadingIconColor = colors.muted, unfocusedLeadingIconColor = colors.muted,
            focusedTrailingIconColor = colors.muted, unfocusedTrailingIconColor = colors.muted, focusedSupportingTextColor = colors.muted, unfocusedSupportingTextColor = colors.muted,
            unfocusedContainerColor = colors.field, focusedContainerColor = colors.field, cursorColor = colors.brand,
            disabledContainerColor = colors.field, disabledTextColor = colors.text, disabledBorderColor = colors.borderInput, disabledLabelColor = colors.muted,
        ),
    )
}

/**
 * Two short fields side by side ("Short name" beside Color, "Age group" beside Gender), stacked when
 * the pair has too little room for both labels on one line: under about 250 dp at the default text
 * size (a 320 dp phone), and proportionally more at the larger text sizes. Each gets the modifier to
 * size it by.
 */
@Composable
fun FieldPair(first: @Composable (Modifier) -> Unit, second: @Composable (Modifier) -> Unit) {
    androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxWidth()) {
        val scale = androidx.compose.ui.platform.LocalDensity.current.fontScale.coerceAtLeast(1f)
        if (maxWidth < 250.dp * scale) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                first(Modifier.fillMaxWidth())
                second(Modifier.fillMaxWidth())
            }
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                first(Modifier.weight(1f))
                second(Modifier.weight(1f))
            }
        }
    }
}

/**
 * A field offering what's been typed before (SET-15's assignors) as chips under it while it has
 * focus, as the website does; a tap fills it.
 */
@Composable
fun SuggestField(label: String, value: String, onChange: (String) -> Unit, suggestions: List<String>, modifier: Modifier = Modifier) {
    var focused by remember { mutableStateOf(false) }
    val typed = value.trim().lowercase()
    val offered = if (focused) suggestions.filter { it.lowercase() != typed && it.lowercase().contains(typed) }.take(8) else emptyList()
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Field(label, value, onChange, Modifier.onFocusChanged { focused = it.isFocused })
        if (offered.isNotEmpty()) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                offered.forEach { s -> Chip(s, modifier = Modifier.clickable(onClickLabel = "Use $s") { onChange(s) }) }
            }
        }
    }
}

/** A choice from a list, shown as a field that opens a menu. */
@Composable
fun <T> Choice(
    label: String, value: T?, options: List<T>, text: (T?) -> String, onChange: (T?) -> Unit, modifier: Modifier = Modifier, allowNone: String? = null,
    swatch: ((T) -> androidx.compose.ui.graphics.Color?)? = null,
    /** More under a divider, such as a team color's Custom (WEB-19); given what closes the menu. */
    extra: (@Composable (close: () -> Unit) -> Unit)? = null,
) {
    var open by remember { mutableStateOf(false) }
    Box(modifier.fillMaxWidth()) {
        val shown = value?.let { swatch?.invoke(it) }
        // The choice wraps rather than running out of the field ("Automatic (Google Maps)" at 320 dp and large text).
        Field(label, text(value), {}, singleLine = false, leading = shown?.let { c -> { ColorSwatch(c) } }, trailing = { PhIcon(Ph.Chevron, size = 18.dp, tint = colors.muted) })
        // Over the field, so a tap anywhere on it opens the menu.
        Box(Modifier.matchParentSize().padding(top = if (label.isEmpty()) 0.dp else 8.dp).clip(RoundedCornerShape(6.dp)).clickable { open = true })
        app.lawfive.ui.theme.OnPanel { DropdownMenu(open, { open = false }, containerColor = colors.surface) {
            if (allowNone != null) {
                DropdownMenuItem({ Text(allowNone, color = colors.muted) }, { onChange(null); open = false })
            }
            for (o in options) {
                val color = swatch?.invoke(o)
                DropdownMenuItem({ Text(text(o)) }, { onChange(o); open = false }, leadingIcon = color?.let { c -> { ColorSwatch(c) } })
            }
            if (extra != null) {
                androidx.compose.material3.HorizontalDivider(color = colors.border)
                extra { open = false }
            }
        } }
    }
}

/** A team's color in a list or field; the border keeps black and white visible in light and dark. */
@Composable
fun ColorSwatch(color: androidx.compose.ui.graphics.Color) {
    Box(Modifier.requiredSize(18.dp).clip(RoundedCornerShape(4.dp)).background(color).border(1.dp, colors.border, RoundedCornerShape(4.dp)))
}

/** A setting with a switch on the right; not [enabled], the switch is grayed and set by something else (its line says what). */
@Composable
fun ToggleRow(title: String, sub: String? = null, checked: Boolean, onChange: (Boolean) -> Unit, divider: Boolean = true, enabled: Boolean = true) {
    ListRow(
        title = title, sub = sub, divider = divider, onClick = if (enabled) ({ onChange(!checked) }) else null,
        trailing = {
            Switch(
                checked, onChange, enabled = enabled,
                colors = SwitchDefaults.colors(
                    checkedTrackColor = colors.brand, checkedThumbColor = colors.onBrand, checkedBorderColor = colors.brand,
                    uncheckedTrackColor = colors.surface2, uncheckedThumbColor = colors.muted, uncheckedBorderColor = colors.borderInput,
                    disabledCheckedTrackColor = colors.brand.copy(alpha = 0.4f), disabledCheckedThumbColor = colors.onBrand, disabledCheckedBorderColor = colors.brand.copy(alpha = 0.4f),
                    disabledUncheckedTrackColor = colors.surface2, disabledUncheckedThumbColor = colors.muted.copy(alpha = 0.5f), disabledUncheckedBorderColor = colors.borderInput,
                ),
            )
        },
    )
}

/** Two or more options side by side, one chosen (DESIGN.md "Segmented control"): the board's, chalk words on near black, the chosen one a chalk slab. */
@Composable
fun <T> Segmented(
    options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit, modifier: Modifier = Modifier,
    /** Behind the options: the board, or the board's dots where it sits on a board already (Stats' filters). */
    background: androidx.compose.ui.graphics.Color? = null,
    /** Each option's least height: 48 dp where gloves tap it (Stats' filters). */
    minHeight: androidx.compose.ui.unit.Dp = 0.dp,
    /** The options share the width equally. */
    fill: Boolean = false,
    /** A long word goes over two lines inside its option rather than being cut (the periods over a heatmap on the narrowest phones). */
    wrap: Boolean = false,
) {
    val c = colors
    val back = background ?: c.board
    Row(
        modifier.clip(RoundedCornerShape(6.dp)).background(back).then(if (c.dark && background == null) Modifier.border(1.dp, c.boardEdge, RoundedCornerShape(6.dp)) else Modifier).padding(3.dp)
            .semantics { selectableGroup() }
            .then(if (wrap) Modifier.height(androidx.compose.foundation.layout.IntrinsicSize.Min) else Modifier),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        for ((value, label) in options) {
            val on = value == selected
            Box(
                Modifier.then(if (fill) Modifier.weight(1f) else Modifier).then(if (wrap) Modifier.fillMaxHeight() else Modifier).heightIn(min = minHeight).clip(RoundedCornerShape(4.dp)).background(if (on) c.chalk else back)
                    .selectable(on, role = androidx.compose.ui.semantics.Role.Tab) { onSelect(value) }.padding(horizontal = if (wrap) 4.dp else 14.dp, vertical = 7.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (wrap) {
                    Text(label.uppercase(), style = LfType.word(16.sp, if (on) c.board else c.onBoardMuted).copy(lineHeight = 16.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center), maxLines = 2)
                } else {
                    Text(label.uppercase(), style = LfType.word(16.sp, if (on) c.board else c.onBoardMuted), maxLines = 1)
                }
            }
        }
    }
}

/** APP-18: whether a form has changes to lose, and what leaving it was going to do. */
class LeaveGuard {
    var dirty by androidx.compose.runtime.mutableStateOf(false)
    var pending by androidx.compose.runtime.mutableStateOf<(() -> Unit)?>(null)

    /** Does it now, or once they've said they're sure. */
    fun leave(action: () -> Unit) {
        if (dirty) pending = action else action()
    }
}

val LocalLeaveGuard = androidx.compose.runtime.staticCompositionLocalOf { LeaveGuard() }

/** APP-18: in a form: asks before Back, the back link or a tab leaves changes unsaved. */
@Composable
fun UnsavedChanges(dirty: Boolean) {
    val guard = LocalLeaveGuard.current
    val nav = LocalNav.current
    androidx.compose.runtime.SideEffect { guard.dirty = dirty }
    androidx.compose.runtime.DisposableEffect(guard) { onDispose { guard.dirty = false } }
    androidx.activity.compose.BackHandler(enabled = dirty) { guard.leave { nav.popBackStack() } }
}

/** APP-18: the question itself, once for the whole app. */
@Composable
fun LeavePrompt(guard: LeaveGuard) {
    val action = guard.pending ?: return
    Confirm(
        "Are you sure you want to leave?", "You have unsaved changes. If you leave now, they'll be lost.", "Leave", dismiss = "Keep editing",
        onConfirm = {
            guard.pending = null
            guard.dirty = false
            action()
        },
        onDismiss = { guard.pending = null },
    )
}

/** A yes/no question before something that can't be undone. */
@Composable
fun Confirm(title: String, text: String, confirm: String, danger: Boolean = true, dismiss: String = "Cancel", onConfirm: () -> Unit, onDismiss: () -> Unit) {
    app.lawfive.ui.theme.OnPanel {
        AlertDialog(
            onDismissRequest = onDismiss,
            // At night a dark slab with the panel's thin edge (DESIGN.md "Panels").
            modifier = if (colors.dark) Modifier.border(1.dp, colors.panelEdge, RoundedCornerShape(6.dp)) else Modifier,
            containerColor = colors.surface,
            shape = RoundedCornerShape(6.dp),
            title = { Text(title.uppercase(), style = LfType.display(26.sp, colors.text, 26.sp)) },
            text = { Text(text, style = MaterialTheme.typography.bodyMedium) },
            confirmButton = { LinkButtonColored(confirm, if (danger) colors.redText else colors.brand) { onConfirm() } },
            dismissButton = { LinkButtonColored(dismiss, colors.muted, onDismiss) },
        )
    }
}

@Composable
fun LinkButtonColored(text: String, colour: androidx.compose.ui.graphics.Color, onClick: () -> Unit) {
    androidx.compose.material3.TextButton(onClick, shape = RoundedCornerShape(6.dp)) { Text(text.uppercase(), color = colour, style = MaterialTheme.typography.labelLarge.copy(fontSize = 16.sp)) }
}

@Composable
fun Gap(height: Int = 12) = Spacer(Modifier.height(height.dp))
