package app.lawfive.data

import java.util.Locale
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// How much of its room an account is using (SEC-6), and saying when a photo doesn't fit (FILE-7), as
// the website does.

class AccountStorage(val usedBytes: Long, val limitBytes: Long?) {
    val full get() = limitBytes != null && usedBytes >= limitBytes
    /** From 80% used, the photos card says how much. */
    val nearlyFull get() = limitBytes != null && usedBytes >= limitBytes * 0.8
    val room get() = limitBytes?.let { maxOf(0L, it - usedBytes) }

    companion object {
        fun from(json: JsonElement?): AccountStorage? {
            val fields = json as? JsonObject ?: return null
            fun field(name: String) = (fields[name] as? JsonPrimitive)?.content?.toDoubleOrNull()?.toLong()
            return AccountStorage(field("usedBytes") ?: return null, field("limitBytes"))
        }
    }
}

/** Known not to fit before it's sent, once the server has refused another. */
class NoRoomForPhoto : Exception()

/** "5.9 MB", "120 MB", "1.5 GB"; whole under 10 MB when it is, so a limit reads "6 MB". */
fun storageSize(bytes: Long): String {
    if (bytes >= 1L shl 30) return String.format(Locale.US, "%.1f GB", bytes / (1L shl 30).toDouble())
    val mb = bytes / (1L shl 20).toDouble()
    return if (mb >= 10 || mb == Math.floor(mb)) "${Math.ceil(mb).toLong()} MB" else String.format(Locale.US, "%.1f MB", mb)
}

fun storageUsedLine(storage: AccountStorage) = "${storageSize(storage.usedBytes)} of ${storageSize(storage.limitBytes ?: 0)} used"

/** The bold start of the notice: `noRoom` photos didn't fit, or none was tried. */
fun noRoomTitle(noRoom: Int) = when (noRoom) {
    0 -> "Your storage is full."
    1 -> "This photo didn't fit."
    else -> "$noRoom photos didn't fit."
}

/** The rest of it; an admin also gets a way to change the limit. */
fun noRoomText(storage: AccountStorage, admin: Boolean) =
    "You've used ${storageSize(storage.usedBytes)} of ${storageSize(storage.limitBytes ?: 0)}. Delete some photos or tracks to make room" +
        if (admin) "." else ", or ask an admin of this server for more."
