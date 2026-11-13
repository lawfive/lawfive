package app.lawfive.data

// The watches among an account's devices (GET /v1/devices): each watch app names itself in the
// X-LawFive-Device header, and phones and browsers are the rest.

object Devices {
    /** The watch apps' names for themselves: Garmin, Wear OS and Apple Watch. */
    val watchKinds = setOf("garmin", "wearos", "applewatch")

    /** Whether any of these device kinds is a watch. */
    fun anyWatch(kinds: List<String?>): Boolean = kinds.any { it in watchKinds }
}
