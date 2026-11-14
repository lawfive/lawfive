package app.lawfive.data

import android.content.Context
import app.lawfive.R
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

// WX-12: what the app is built with, each with its copyright and license in full, as the licenses ask
// (MIT, BSD and Apache 2.0 want the notice and license text with each copy, and Apache 2.0 a
// library's own NOTICE). The libraries come from what Gradle bundles, listed at build time by the
// AboutLibraries plugin (res/raw/aboutlibraries.json, and the Wear OS app's list in
// assets/licenses/wear-libraries.json), so the list can't fall behind. What Gradle doesn't bring (the
// fonts and icons) and each library's own copyright line where its license names one are in
// assets/licenses/.

/** A license as something carries it: its name, a short name for its chip, where it's published, and its text (none for terms only on the web). */
data class LicenseText(val name: String, val short: String, val url: String?, val text: String?)

/** A library, or a font or icon set, with who it's by and its licenses. */
data class Credited(
    val id: String,
    val name: String,
    /** Its makers or copyright holders, as its own files name them. */
    val by: String?,
    val versions: List<String>,
    val website: String?,
    /** In the Wear OS app only. */
    val watchOnly: Boolean,
    /** Its own NOTICE (Apache 2.0, section 4 d). */
    val notice: String?,
    val licenses: List<LicenseText>,
)

/** The fonts and icons, then the libraries, each in name order. */
data class Bundled(val works: List<Credited>, val libraries: List<Credited>) {
    fun find(id: String) = works.firstOrNull { it.id == id } ?: libraries.firstOrNull { it.id == id }
}

/** A paragraph of a license's text, as the screen sets it. */
data class LicenseParagraph(val text: String, val heading: Boolean = false)

object Licenses {
    /** Licenses whose text names the library's own copyright holder: each such library has its own text in assets/licenses/libraries/. */
    val OWN_COPYRIGHT = setOf("MIT", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "BSD-1-Clause")

    @Volatile private var kept: Bundled? = null

    /** What's bundled, read once (a moment's work, off the main thread). */
    fun load(context: Context): Bundled = kept ?: read(context).also { kept = it }

    private fun read(context: Context): Bundled {
        val assets = context.assets
        fun asset(path: String): String? = runCatching { assets.open(path).bufferedReader().use { it.readText() } }.getOrNull()
        val phone = context.resources.openRawResource(R.raw.aboutlibraries).bufferedReader().use { it.readText() }
        return Bundled(works(::asset), libraries(phone, asset("licenses/wear-libraries.json"), ::asset))
    }

    private val ofl = "SIL Open Font License 1.1"

    /** The fonts and icons, which aren't Gradle's: their license files, with their copyright lines, are in assets/licenses/. */
    internal fun works(asset: (String) -> String?): List<Credited> = listOf(
        Credited("font:barlow", "Barlow and Barlow Condensed", "The Barlow Project Authors", emptyList(), "https://github.com/jpt/barlow", false, null,
            listOf(LicenseText(ofl, "OFL 1.1", "https://openfontlicense.org", asset("licenses/barlow-OFL.txt")))),
        Credited("font:jetbrains-mono", "JetBrains Mono", "The JetBrains Mono Project Authors", emptyList(), "https://www.jetbrains.com/lp/mono/", false, null,
            listOf(LicenseText(ofl, "OFL 1.1", "https://openfontlicense.org", asset("licenses/jetbrains-mono-OFL.txt")))),
        Credited("icons:phosphor", "Phosphor Icons", "Phosphor Icons", emptyList(), "https://phosphoricons.com", false, null,
            listOf(LicenseText("MIT License", "MIT", "https://opensource.org/license/mit", asset("licenses/phosphor-MIT.txt")))),
    )

    /** The phone app's libraries and the Wear OS app's, one entry a library, with its own copyright line and notice where it has them. */
    internal fun libraries(phone: String, wear: String?, asset: (String) -> String?): List<Credited> {
        val phoneList = format.decodeFromString(AboutList.serializer(), phone)
        val wearList = wear?.let { runCatching { format.decodeFromString(AboutList.serializer(), it) }.getOrNull() }
        val licenses = wearList?.licenses.orEmpty() + phoneList.licenses
        val byId = linkedMapOf<String, MutableList<Pair<AboutLibrary, Boolean>>>()
        phoneList.libraries.forEach { byId.getOrPut(it.uniqueId) { mutableListOf() } += it to false }
        wearList?.libraries?.forEach { byId.getOrPut(it.uniqueId) { mutableListOf() } += it to true }
        return byId.map { (id, copies) ->
            val lib = copies.first().first
            val file = id.replace(':', '_')
            val own = asset("licenses/libraries/$file.txt")
            Credited(
                id = id,
                name = lib.name?.takeIf { it.isNotBlank() && ':' !in it } ?: id.substringAfter(':'),
                by = lib.organization?.name?.takeIf { it.isNotBlank() }
                    ?: lib.developers.mapNotNull { it.name?.takeIf(String::isNotBlank) }.distinct().take(3).joinToString(", ").ifEmpty { null },
                versions = copies.mapNotNull { it.first.artifactVersion }.distinct(),
                website = lib.website?.takeIf { it.startsWith("http") } ?: lib.scm?.url?.takeIf { it.startsWith("http") },
                watchOnly = copies.all { it.second },
                notice = asset("licenses/libraries/$file.notice.txt"),
                licenses = lib.licenses.mapNotNull { key -> licenses[key]?.let { license(it, own) } },
            )
        }.sortedWith(compareBy({ it.name.lowercase() }, { it.id }))
    }

    private fun license(l: AboutLicense, own: String?): LicenseText {
        val spdx = l.spdxId
        val text = (if (own != null && (spdx in OWN_COPYRIGHT || spdx == null)) own else null) ?: l.content?.takeIf { it.isNotBlank() }
        val (name, short) = when (spdx) {
            "Apache-2.0" -> "Apache License 2.0" to "Apache 2.0"
            "MIT" -> "MIT License" to "MIT"
            "BSD-2-Clause" -> "BSD 2-Clause License" to "BSD 2-Clause"
            "BSD-3-Clause" -> "BSD 3-Clause License" to "BSD 3-Clause"
            "ISC" -> "ISC License" to "ISC"
            else -> l.name to if (text == null) "Terms" else (spdx ?: "License")
        }
        return LicenseText(name, short, l.url, text)
    }

    private val format = Json { ignoreUnknownKeys = true }

    private val separator = Regex("""^\s*([-=*_~`])\1{2,}.*$""")
    private val markdownLink = Regex("""\[([^\]]+)]\(([^)\s]+)\)""")
    private val markdownHeading = Regex("""^#{1,6}\s+""")
    /** A list item, or a "Name: value" line: these start a line of their own within a paragraph. */
    private val lineStart = Regex("""^([-*•]|\(?[0-9]{1,2}[.)]|\([a-z]{1,4}\)|[a-z][.)]|[A-Z][A-Za-z]{1,15}:)\s""")

    /**
     * A license's text as paragraphs for a phone's width: the lines a paragraph was wrapped in for a
     * terminal are joined, a list item or "URL: …" keeps a line of its own, rules and Markdown's code
     * fences go, a Markdown link keeps its words, and a heading (Markdown's, or a short line in
     * capitals) is marked as one. The words themselves are as the license has them.
     */
    fun paragraphs(text: String): List<LicenseParagraph> {
        val out = mutableListOf<LicenseParagraph>()
        val lines = mutableListOf<String>()
        fun capitals(line: String) = line.any { it.isLetter() } && line.none { it.isLowerCase() }
        fun flush() {
            if (lines.isEmpty()) return
            // A short line in capitals over its paragraph ("PREAMBLE", "DEFINITIONS") is its heading.
            if (lines.size > 1 && lines[0].length <= 40 && capitals(lines[0])) out += LicenseParagraph(lines.removeAt(0), heading = true)
            val joined = StringBuilder()
            lines.forEach { line ->
                if (joined.isNotEmpty()) joined.append(if (lineStart.containsMatchIn(line)) '\n' else ' ')
                joined.append(line)
            }
            val words = joined.toString()
            val heading = lines.size == 1 && words.length <= 80 && capitals(words)
            out += LicenseParagraph(words, heading)
            lines.clear()
        }
        text.replace("\r\n", "\n").replace("<br />", "\n").lines().forEach { raw ->
            val line = markdownLink.replace(raw.trim()) { it.groupValues[1] }.replace(Regex("""[ \t]{2,}"""), " ")
            when {
                line.isEmpty() -> flush()
                separator.matches(line) -> {}
                markdownHeading.containsMatchIn(line) -> {
                    flush()
                    out += LicenseParagraph(line.replace(markdownHeading, ""), heading = true)
                }
                else -> lines += line
            }
        }
        flush()
        return out
    }
}

@Serializable
private class AboutList(val libraries: List<AboutLibrary> = emptyList(), val licenses: Map<String, AboutLicense> = emptyMap())

@Serializable
private class AboutLibrary(
    val uniqueId: String,
    val artifactVersion: String? = null,
    val name: String? = null,
    val website: String? = null,
    val developers: List<AboutName> = emptyList(),
    val organization: AboutName? = null,
    val scm: AboutScm? = null,
    val licenses: List<String> = emptyList(),
)

@Serializable
private class AboutName(val name: String? = null)

@Serializable
private class AboutScm(val url: String? = null)

@Serializable
private class AboutLicense(val name: String, val url: String? = null, val content: String? = null, val spdxId: String? = null)
