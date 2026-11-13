package app.lawfive

import app.lawfive.ui.directionsUri
import org.junit.Assert.assertEquals
import org.junit.Test

// WEB-14: Directions open in the maps app chosen in Settings; automatic is Google Maps on Android.
class DirectionsTest {
    @Test
    fun `automatic and Google open Google Maps, Apple opens Apple Maps`() {
        assertEquals("https://www.google.com/maps/dir/?api=1&destination=33.6,-117.6", directionsUri(33.6, -117.6, null))
        assertEquals("https://www.google.com/maps/dir/?api=1&destination=33.6,-117.6", directionsUri(33.6, -117.6, "google"))
        assertEquals("https://maps.apple.com/?daddr=33.6,-117.6", directionsUri(33.6, -117.6, "apple"))
    }

    @Test
    fun `an address is encoded`() {
        assertEquals("https://www.google.com/maps/dir/?api=1&destination=30901%20Oso%20Pkwy,%20Trabuco%20Canyon", directionsUri("30901 Oso Pkwy, Trabuco Canyon", "auto"))
    }
}
