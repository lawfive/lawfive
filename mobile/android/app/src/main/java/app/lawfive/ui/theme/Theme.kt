package app.lawfive.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.lawfive.R

// LawFive's look on Android (APP-1, WEB-24, DESIGN.md): Pitch & Scoreboard. The page is the grass,
// figures sit on near-black stadium boards, dense content on chalk panels (dark slabs at a night
// match); Barlow for text, Barlow Condensed (black italic on the boards) for headings and figures,
// JetBrains Mono for codes and the boards' small labels; on Material 3.
//
// As on the website, where something sits sets its colors: the working tokens (`text`, `muted`,
// `surface`, `brand`…) take the ground under them (`Ground`). The page is the grass, so its words are
// chalk; `LfCard` and the other panels provide the panel's set, boards the board's, so components
// use the working tokens and need no colors of their own.

/** What something sits on (DESIGN.md "Color"): the grass, a chalk panel, or a stadium board. */
enum class Ground { Grass, Panel, Board }

@Immutable
data class LawFiveColors(
    val ground: Ground,
    val dark: Boolean,
    // The working tokens, for where something sits.
    /** The page: the grass. */
    val bg: Color,
    val surface: Color,
    val surface2: Color,
    /** Inside a field people type in. */
    val field: Color,
    val text: Color,
    val muted: Color,
    val border: Color,
    /** Around fields people type in: about 3:1 against what's behind them (WCAG 1.4.11). */
    val borderInput: Color,
    val brand: Color,
    val brandStrong: Color,
    val brandSoft: Color,
    val onBrand: Color,
    /** Red words (errors, Delete, a red chip), dark enough on a panel (and light enough on the grass) to read (WCAG AA). */
    val redText: Color,
    val redSoft: Color,
    val amberSoft: Color,
    val amberText: Color,
    val blueSoft: Color,
    val blueText: Color,
    /** A clear day's sun and a storm (WX-5). */
    val weatherAmber: Color,
    val chartGrid: Color,
    // The ground itself and the things drawn on it, the same wherever they're used.
    val pitch: Color,
    val pitchStripe: Color,
    val chalk: Color,
    /** The pitch markings: touchlines, the halfway line, circles, rules (3 dp). */
    val chalkLine: Color,
    val chalkMuted: Color,
    val chalkFaint: Color,
    /** The hard offset under a page's title on the grass: dark green by day, mint at night. */
    val heroShadow: Color,
    val board: Color,
    /** A board's 1 dp edge at night (none by day). */
    val boardEdge: Color,
    val boardDots: Color,
    val boardRule: Color,
    val onBoard: Color,
    val onBoardStrong: Color,
    val onBoardMuted: Color,
    /** On the board, the side that lost. */
    val onBoardDim: Color,
    /** The board's mint labels ("NEXT MATCH", "FULL TIME"). */
    val boardAccent: Color,
    val panel: Color,
    val panel2: Color,
    /** A panel's 1 dp edge at night (none by day). */
    val panelEdge: Color,
    /** A panel's hard 3 dp drop by day (none at night). */
    val panelShadow: Color,
    val ink: Color,
    val inkMuted: Color,
    val inkBrand: Color,
    /** A team with no color, on the board. */
    val kitBlank: Color,
    val yellow: Color,
    /** A red card, a delete icon: red as a mark. */
    val red: Color,
    /** Behind white words, a filled Delete button, as the website's --red-strong. */
    val redStrong: Color,
    /** Text on the yellow: the waiting count. */
    val onYellow: Color,
    val coin: Color = Color(0xFFD9A92C),
    val coinEdge: Color = Color(0xFF8A6508),
    val coinInk: Color = Color(0xFF5F4503),
    /** Speed bands on maps, walking to sprinting (DESIGN.md, TRK-5). */
    val speed: List<Color>,
    /** A panel's heavy 3 dp rule (the figures across its top, Where's league table): `--ink-rule`. */
    val inkRule: Color,
    // Stats on the board and the grass (WEB-24, the broadcast stats package), the same day and night:
    // roles and genders in chalk, mint, a deep mint and grays (with their values always written).
    /** AR2, inside the assistant's mint: `--role-ar2`. */
    val roleAr2: Color = Color(0xFF1D7A54),
    /** The fourth official, and co-ed: `--role-fourth`. */
    val roleFourth: Color = Color(0xFF9AA39E),
    /** None set: `--role-none`. */
    val roleNone: Color = Color(0xFF5B6560),
    /** Busiest times' lit tiles, from the grass's green to pale mint (`--heat-1`…`6`): chalk figures on the first three, board-black on the rest. */
    val heat: List<Color> = listOf(0xFF1B4A34, 0xFF1F6142, 0xFF237A50, 0xFF4FAE80, 0xFF86CFA6, 0xFFC6ECD5).map { Color(it) },
    /** Speed bands on the board: the night match's ramp by day too, dark green to pale mint. */
    val boardSpeed: List<Color> = listOf(0xFF1F8A59, 0xFF36A677, 0xFF62C294, 0xFF9BDCB9, 0xFFD4F2E2).map { Color(it) },
    /** Heart-rate zones on the board: the night match's orange ramp by day too, dark to pale. */
    val boardZones: List<Color> = listOf(0xFF8A3311, 0xFFB8481A, 0xFFD95926, 0xFFEC8257, 0xFFF5AD8A).map { Color(it) },
    /** The pitch heatmap painted on the grass (TRK-9, `--contour-*`), the same on any ground. */
    val contour: ContourColors,
)

/**
 * TRK-9, WEB-24: the pitch heatmap painted on the grass (`--contour-*`): its ground and stripe, six
 * bands from the grass's green to pale mint (greens only: yellow and red stay with the cards), the
 * bands' edges, the markings' dark edge and how strong the chalk is (70% at a night match).
 */
@Immutable
data class ContourColors(val ground: Color, val stripe: Color, val bands: List<Color>, val line: Color, val case: Color, val chalk: Float)

/** The raw palette of DESIGN.md's tokens, for one mode. */
private class Palette(val dark: Boolean) {
    val pitch = if (dark) Color(0xFF0F2E20) else Color(0xFF12613E)
    val pitchStripe = if (dark) Color(0xFF0D291C) else Color(0xFF115E3C)
    val chalk = if (dark) Color(0xFFE6E9E3) else Color(0xFFF4F2E9)
    val chalkLine = if (dark) Color(0xFFB4BDB6) else Color(0xFFF4F2E9)
    val chalkMuted = if (dark) Color(0xFFA6C2B0) else Color(0xFFC4DCCD)
    val chalkFaint = if (dark) Color(0xFFB4BDB6).copy(alpha = 0.30f) else Color(0xFFF4F2E9).copy(alpha = 0.32f)
    val heroShadow = if (dark) Color(0xFF2FAE7A) else Color(0xFF06301D)
    val board = if (dark) Color(0xFF121614) else Color(0xFF0B0E0D)
    val boardEdge = if (dark) Color(0xFF313C36) else Color.Transparent
    val boardDots = if (dark) Color(0xFF232C27) else Color(0xFF1C2420)
    val boardRule = if (dark) Color(0xFF2E3934) else Color(0xFF25302B)
    val onBoard = if (dark) Color(0xFFE6E9E3) else Color(0xFFF4F2E9)
    val onBoardMuted = if (dark) Color(0xFFA7B1AB) else Color(0xFFB6BFBA)
    val onBoardDim = if (dark) Color(0xFF7C8580) else Color(0xFF7F8883)
    val boardAccent = Color(0xFF2FAE7A)
    val panel = if (dark) Color(0xFF0F1B15) else Color(0xFFF4F2E9)
    val panel2 = if (dark) Color(0xFF16241D) else Color(0xFFE9E7DC)
    val panelEdge = if (dark) Color(0xFF5D6A63) else Color.Transparent
    val panelShadow = if (dark) Color.Transparent else Color(0xFF06301D).copy(alpha = 0.45f)
    val ink = if (dark) Color(0xFFE6E9E3) else Color(0xFF0E1311)
    val inkMuted = if (dark) Color(0xFFA3AEA7) else Color(0xFF4D5650)
    val inkBorder = if (dark) Color(0xFF26332C) else Color(0xFFD6D4C8)
    val inkRule = if (dark) Color(0xFF7D8A83) else Color(0xFF0E1311)
    val inkInput = if (dark) Color(0xFF6B7872) else Color(0xFF858A82)
    val inkField = if (dark) Color(0xFF0B130F) else Color(0xFFFBFAF6)
    val inkBrand = if (dark) Color(0xFF2FAE7A) else Color(0xFF0B6B47)
    val inkBrandStrong = if (dark) Color(0xFF5CC999) else Color(0xFF08573A)
    val inkBrandSoft = if (dark) Color(0xFF173A2B) else Color(0xFFDBE8DB)
    val inkOnBrand = if (dark) Color(0xFF04140D) else Color(0xFFFFFFFF)
    val inkRedText = if (dark) Color(0xFFFF8589) else Color(0xFFB8232A)
    val inkRedSoft = if (dark) Color(0xFF3A1B1C) else Color(0xFFF6DCD7)
    val inkAmberSoft = if (dark) Color(0xFF3A3214) else Color(0xFFF6E8B5)
    val inkAmberText = if (dark) Color(0xFFF0CD5A) else Color(0xFF6F5400)
    val inkBlueSoft = if (dark) Color(0xFF172636) else Color(0xFFDDE6EE)
    val inkBlueText = if (dark) Color(0xFF8AB8EA) else Color(0xFF1A5699)
    val inkWeatherAmber = if (dark) Color(0xFFE8A317) else Color(0xFFA06D00)
    val inkChartGrid = if (dark) Color(0xFF26332C) else Color(0xFFDCDACF)
    val contour = if (dark) {
        ContourColors(
            Color(0xFF0E2C1E), Color(0xFF0B2418), listOf(0xFF133A28, 0xFF194832, 0xFF22593E, 0xFF2E6C4C, 0xFF418360, 0xFF5F9D7B).map { Color(it) },
            Color(0xFF03110A), Color(0xFF04140C), 0.7f,
        )
    } else {
        ContourColors(
            Color(0xFF12613E), Color(0xFF0F5A39), listOf(0xFF1A6E45, 0xFF258052, 0xFF359463, 0xFF52AB78, 0xFF86C79D, 0xFFC6E7CB).map { Color(it) },
            Color(0xFF083D25), Color(0xFF0A3A24), 1f,
        )
    }
    val speed = if (dark) listOf(Color(0xFF1F8A59), Color(0xFF36A677), Color(0xFF62C294), Color(0xFF9BDCB9), Color(0xFFD4F2E2))
        else listOf(Color(0xFF3A9A6C), Color(0xFF187D4F), Color(0xFF0B5E3E), Color(0xFF06472D), Color(0xFF03301D))

    fun colors(ground: Ground): LawFiveColors {
        val white = Color.White
        // On the grass and on a board: light words on dark green or near black.
        val light = LawFiveColors(
            ground = ground, dark = dark, bg = pitch,
            surface = Color.Transparent, surface2 = white.copy(alpha = 0.09f), field = Color.Transparent,
            text = chalk, muted = chalkMuted, border = chalkFaint, borderInput = chalkLine,
            brand = chalk, brandStrong = white, brandSoft = white.copy(alpha = 0.14f), onBrand = board,
            redText = Color(0xFFFFC2BE), redSoft = Color(0xFFD4202A).copy(alpha = 0.30f),
            amberSoft = Color(0xFFF7C600).copy(alpha = 0.22f), amberText = Color(0xFFFFE08A),
            blueSoft = Color(0xFF78AAE6).copy(alpha = 0.22f), blueText = Color(0xFFC6DDFF),
            weatherAmber = Color(0xFFFFD25E), chartGrid = chalkFaint,
            pitch = pitch, pitchStripe = pitchStripe, chalk = chalk, chalkLine = chalkLine, chalkMuted = chalkMuted, chalkFaint = chalkFaint,
            heroShadow = heroShadow, board = board, boardEdge = boardEdge, boardDots = boardDots, boardRule = boardRule,
            onBoard = onBoard, onBoardStrong = white, onBoardMuted = onBoardMuted, onBoardDim = onBoardDim, boardAccent = boardAccent,
            panel = panel, panel2 = panel2, panelEdge = panelEdge, panelShadow = panelShadow, ink = ink, inkMuted = inkMuted, inkBrand = inkBrand,
            kitBlank = Color(0xFF3A403D), yellow = Color(0xFFF7C600), red = Color(0xFFD4202A), redStrong = Color(0xFFB8232A),
            onYellow = Color(0xFF1B1600), speed = speed, inkRule = inkRule, contour = contour,
        )
        return when (ground) {
            Ground.Grass -> light
            Ground.Board -> light.copy(
                surface = board, surface2 = boardDots, text = onBoard, muted = onBoardMuted, border = boardRule,
                brandSoft = white.copy(alpha = 0.12f),
            )
            Ground.Panel -> light.copy(
                surface = panel, surface2 = panel2, field = inkField, text = ink, muted = inkMuted, border = inkBorder, borderInput = inkInput,
                brand = inkBrand, brandStrong = inkBrandStrong, brandSoft = inkBrandSoft, onBrand = inkOnBrand,
                redText = inkRedText, redSoft = inkRedSoft, amberSoft = inkAmberSoft, amberText = inkAmberText,
                blueSoft = inkBlueSoft, blueText = inkBlueText, weatherAmber = inkWeatherAmber, chartGrid = inkChartGrid,
            )
        }
    }
}

private val light = Palette(false)
private val dark = Palette(true)
private val grounds = mapOf(
    false to Ground.entries.associateWith { light.colors(it) },
    true to Ground.entries.associateWith { dark.colors(it) },
)

/** The colors of a ground in either mode. */
fun lawFiveColors(dark: Boolean, ground: Ground): LawFiveColors = grounds.getValue(dark).getValue(ground)

/** The page's colors (the grass) by day and at night. */
val LightColors = lawFiveColors(false, Ground.Grass)
val DarkColors = lawFiveColors(true, Ground.Grass)

/** What a surface really shows: a see-through token over the grass. */
fun LawFiveColors.solid(c: Color): Color = if (c.alpha < 1f) c.compositeOver(if (ground == Ground.Board) board else if (ground == Ground.Panel) panel else pitch) else c

val Barlow = FontFamily(
    Font(R.font.barlow_regular, FontWeight.Normal),
    Font(R.font.barlow_medium, FontWeight.Medium),
    Font(R.font.barlow_semibold, FontWeight.SemiBold),
    Font(R.font.barlow_bold, FontWeight.Bold),
)

/** Barlow Condensed: 600 to 900, and 700 to 900 italic (the boards' black italic), as the website loads. */
val BarlowCondensed = FontFamily(
    Font(R.font.barlow_condensed_semibold, FontWeight.SemiBold),
    Font(R.font.barlow_condensed_bold, FontWeight.Bold),
    Font(R.font.barlow_condensed_extrabold, FontWeight.ExtraBold),
    Font(R.font.barlow_condensed_black, FontWeight.Black),
    Font(R.font.barlow_condensed_bold_italic, FontWeight.Bold, FontStyle.Italic),
    Font(R.font.barlow_condensed_extrabold_italic, FontWeight.ExtraBold, FontStyle.Italic),
    Font(R.font.barlow_condensed_black_italic, FontWeight.Black, FontStyle.Italic),
)
val Mono = FontFamily(
    Font(R.font.jetbrains_mono, FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
    Font(R.font.jetbrains_mono, FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.weight(700))),
)

/** The boards' and headings' type (DESIGN.md "Type"). */
object LfType {
    /** Barlow Condensed black italic: headings, kit names and the figures on the boards. Write the words in capitals where DESIGN.md has them. */
    fun display(size: TextUnit, color: Color = Color.Unspecified, lineHeight: TextUnit = size * 0.95f) = TextStyle(
        fontFamily = BarlowCondensed, fontWeight = FontWeight.Black, fontStyle = FontStyle.Italic, fontSize = size, lineHeight = lineHeight, color = color,
        fontFeatureSettings = "tnum",
    )

    /** The board's small labels ("NEXT MATCH", "VENUE"): JetBrains Mono bold capitals, spaced. */
    fun label(size: TextUnit = 11.5.sp, color: Color = Color.Unspecified, spacing: Float = 0.14f) = TextStyle(
        fontFamily = Mono, fontWeight = FontWeight.Bold, fontSize = size, lineHeight = size * 1.3f, letterSpacing = spacing.em, color = color,
    )

    /** The board's words (buttons, chips, tabs): Barlow Condensed extra-bold capitals. */
    fun word(size: TextUnit = 17.sp, color: Color = Color.Unspecified, weight: FontWeight = FontWeight.ExtraBold) = TextStyle(
        fontFamily = BarlowCondensed, fontWeight = weight, fontSize = size, lineHeight = size * 1.15f, letterSpacing = 0.05.em, color = color,
    )
}

val LocalColors = staticCompositionLocalOf { LightColors }

/** The LawFive colours for where this sits, in either mode. */
val colors: LawFiveColors
    @Composable get() = LocalColors.current

private fun typography(c: LawFiveColors) = Typography(
    displayLarge = LfType.display(56.sp, c.text, 52.sp),
    displayMedium = LfType.display(42.sp, c.text, 40.sp),
    headlineLarge = LfType.display(34.sp, c.text, 34.sp),
    headlineSmall = LfType.display(26.sp, c.text, 26.sp),
    titleLarge = TextStyle(fontFamily = Barlow, fontWeight = FontWeight.Bold, fontSize = 20.sp, lineHeight = 26.sp, color = c.text),
    titleMedium = TextStyle(fontFamily = Barlow, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp, color = c.text),
    // Section labels: small capitals in JetBrains Mono, as the boards' own labels (the website's h3).
    titleSmall = LfType.label(12.sp, c.muted, 0.12f),
    bodyLarge = TextStyle(fontFamily = Barlow, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 23.sp, color = c.text),
    bodyMedium = TextStyle(fontFamily = Barlow, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 21.sp, color = c.text),
    bodySmall = TextStyle(fontFamily = Barlow, fontWeight = FontWeight.Medium, fontSize = 13.sp, lineHeight = 18.sp, color = c.muted),
    // Buttons and tabs: the board's words.
    labelLarge = LfType.word(17.sp),
    labelMedium = TextStyle(fontFamily = Barlow, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, lineHeight = 16.sp),
    labelSmall = TextStyle(fontFamily = Barlow, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, lineHeight = 14.sp, letterSpacing = 0.6.sp),
)

/**
 * Material's colour scheme, every slot from the ground's tokens, so no Material default (its purples)
 * shows through in its parts: chips (secondary containers), the time picker (tertiary), snackbars
 * (inverse: the board).
 */
private fun colorScheme(c: LawFiveColors): ColorScheme {
    val base = if (c.dark) darkColorScheme() else lightColorScheme()
    val surface = c.solid(c.surface.takeIf { it.alpha > 0f } ?: c.pitch)
    val surface2 = c.solid(c.surface2)
    return base.copy(
        primary = c.brand, onPrimary = c.onBrand, primaryContainer = c.brandSoft, onPrimaryContainer = c.text, inversePrimary = c.boardAccent,
        secondary = c.brand, onSecondary = c.onBrand, secondaryContainer = c.brandSoft, onSecondaryContainer = c.text,
        tertiary = c.brand, onTertiary = c.onBrand, tertiaryContainer = c.brandSoft, onTertiaryContainer = c.text,
        background = c.pitch, onBackground = c.chalk, surface = surface, onSurface = c.text, surfaceVariant = surface2, onSurfaceVariant = c.muted,
        surfaceTint = surface, inverseSurface = c.board, inverseOnSurface = c.onBoard,
        error = c.redText, onError = Color.White, errorContainer = c.redSoft, onErrorContainer = c.redText,
        outline = c.borderInput, outlineVariant = c.border, scrim = Color.Black.copy(alpha = 0.5f),
        surfaceBright = surface, surfaceDim = surface, surfaceContainer = surface, surfaceContainerHigh = surface2,
        surfaceContainerHighest = surface2, surfaceContainerLow = surface, surfaceContainerLowest = surface,
    )
}

/** DESIGN.md "Shape and surface": 6 dp for every surface, 4 dp for chips and the items in a menu; nothing else. */
private val shapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp), small = RoundedCornerShape(6.dp), medium = RoundedCornerShape(6.dp),
    large = RoundedCornerShape(6.dp), extraLarge = RoundedCornerShape(6.dp),
)

@Composable
private fun Provide(c: LawFiveColors, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalColors provides c, LocalContentColor provides c.text) {
        MaterialTheme(colorScheme = colorScheme(c), typography = typography(c), shapes = shapes, content = content)
    }
}

/** What's inside sits on `ground`: its words, buttons and fields take that ground's colors. */
@Composable
fun OnGround(ground: Ground, content: @Composable () -> Unit) {
    val c = colors
    if (c.ground == ground) content() else Provide(lawFiveColors(c.dark, ground), content)
}

/** On a chalk panel: cards, dialogs, menus and sheets. */
@Composable
fun OnPanel(content: @Composable () -> Unit) = OnGround(Ground.Panel, content)

/** On a stadium board. */
@Composable
fun OnBoard(content: @Composable () -> Unit) = OnGround(Ground.Board, content)

@Composable
fun LawFiveTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    Provide(lawFiveColors(dark, Ground.Grass), content)
}
