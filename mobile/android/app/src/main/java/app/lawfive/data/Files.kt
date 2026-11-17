package app.lawfive.data

import app.lawfive.schema.Attachment
import java.nio.charset.Charset
import java.nio.charset.CodingErrorAction
import java.util.Locale

// Files on matches, venues and competitions (FILE-6 to FILE-13), in the website's words
// (web/src/files.ts): what each is, its line in the list, the first lines of a CSV or text file,
// and what the server said when it refused one. The server checks what each file is and names it.

/** The server's own most for a file (FILE-9); a plan may allow less, which the server says. */
const val MAX_FILE_BYTES = 20L * 1024 * 1024

/** How many lines of a CSV or text file are shown (FILE-12). */
const val PREVIEW_LINES = 200

/** What the phone's file picker offers: the kinds the server takes. */
val fileMimeTypes = arrayOf(
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv", "text/comma-separated-values",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "image/jpeg", "image/png", "image/webp",
)

enum class FileKind(val label: String) { PDF("PDF"), XLSX("Spreadsheet"), CSV("CSV"), DOCX("Word"), TXT("Text"), PHOTO("Photo") }

/** What a file is, for its icon, its line and how it opens. */
fun fileKind(contentType: String): FileKind = when (contentType) {
    "application/pdf" -> FileKind.PDF
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" -> FileKind.XLSX
    "text/csv" -> FileKind.CSV
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document" -> FileKind.DOCX
    "image/jpeg", "image/png", "image/webp" -> FileKind.PHOTO
    else -> FileKind.TXT
}

/** "317 bytes", "12 KB", "1.2 MB": a file's size as the list says it. */
fun fileSize(bytes: Long): String {
    val kb = bytes / 1024.0
    return when {
        kb < 1 -> "$bytes bytes"
        kb < 1000 -> "${maxOf(1, Math.round(kb))} KB"
        else -> storageSize(bytes)
    }
}

/** "PDF · 1.2 MB": its kind and size, as the list shows them. */
fun describeFile(file: Attachment): String = "${fileKind(file.contentType).label} · ${fileSize(file.size)}"

/** A file's name; the server always gives one, and "File" stands in otherwise (FILE-10). */
val Attachment.fileName: String get() = name ?: "File"

/** Whether it's shown in the app (FILE-12, FILE-13): a PDF page by page, a photo large, CSV and text as text. */
fun opensInApp(file: Attachment): Boolean = fileKind(file.contentType) != FileKind.XLSX && fileKind(file.contentType) != FileKind.DOCX

/** The part of a name before its ending, and the ending, which a file keeps when renamed (FILE-10). */
fun splitName(name: String): Pair<String, String> {
    val dot = name.lastIndexOf('.')
    return if (dot > 0) name.substring(0, dot) to name.substring(dot) else name to ""
}

/** "It stays a PDF file": what Rename keeps. */
fun keepsEnding(ending: String): String = if (ending.isEmpty()) "It stays the same kind" else "It stays a ${ending.drop(1).uppercase(Locale.US)} file"

class TextPreview(val lines: List<String>, val more: Boolean)

/**
 * The first lines of a CSV or text file, never as a page (FILE-12): in UTF-8, or the older Windows
 * encoding when it isn't UTF-8 (the two the server takes, FILE-9).
 */
fun textPreview(bytes: ByteArray): TextPreview {
    val decoded = decodeText(bytes).removePrefix("\uFEFF")
    val lines = decoded.split(Regex("\r\n|\r|\n")).toMutableList()
    if (lines.lastOrNull() == "") lines.removeAt(lines.size - 1)
    return TextPreview(lines.take(PREVIEW_LINES), lines.size > PREVIEW_LINES)
}

/** UTF-8 when it is, else Windows-1252. */
fun decodeText(bytes: ByteArray): String = try {
    Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
        .decode(java.nio.ByteBuffer.wrap(bytes)).toString()
} catch (_: java.nio.charset.CharacterCodingException) {
    String(bytes, Charset.forName("windows-1252"))
}

/** One file that wasn't added, and why, in the server's words. */
data class Refused(val name: String, val why: String)

/**
 * FILE-7: what to say about refusals, as the website does: the server ends each with what it
 * takes ("LawFive keeps PDF, …"), which is said once, after them all.
 */
fun takenLine(refused: List<Refused>): String? = refused.firstNotNullOfOrNull { Regex("\\s*(LawFive keeps .*)$").find(it.why)?.groupValues?.get(1) }

fun withoutTaken(refused: List<Refused>): List<Refused> {
    val taken = takenLine(refused) ?: return refused
    return refused.map { it.copy(why = it.why.replace(" $taken", "").replace(taken, "")) }
}

/** The bold start of a refusal's notice for one or several files. */
fun refusedTitle(refused: List<Refused>): String =
    if (refused.size == 1) "${refused[0].name} wasn't added." else "${refused.size} files weren't added."

/** The words when a file is bigger than the server ever takes, before it's sent. */
fun tooBig(name: String) = "$name is too big: at most ${storageSize(MAX_FILE_BYTES)}."
