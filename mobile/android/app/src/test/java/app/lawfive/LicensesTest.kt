package app.lawfive

import androidx.test.core.app.ApplicationProvider
import app.lawfive.data.Licenses
import app.lawfive.snapshots.SnapshotApp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

// WX-12: the full license texts, from the lists Gradle makes of what the phone and Wear OS apps bundle.
// A library added with a license that names its own copyright holder (MIT, BSD) fails here until its
// own text is in assets/licenses/libraries/, so the screen never shows a license's blank template.
@RunWith(RobolectricTestRunner::class)
@Config(application = SnapshotApp::class)
class LicensesTest {
    private val bundled by lazy { Licenses.load(ApplicationProvider.getApplicationContext()) }

    @Test
    fun `the phone's and the watch's libraries are listed`() {
        val ids = bundled.libraries.map { it.id }.toSet()
        for (id in listOf("com.squareup.okhttp3:okhttp", "org.maplibre.gl:android-sdk", "com.garmin.connectiq:ciq-companion-app-sdk", "androidx.room:room-runtime")) {
            assertTrue("$id is listed", id in ids)
        }
        // From the Wear OS app's list alone.
        val watch = bundled.libraries.first { it.id == "androidx.wear:wear-ongoing" }
        assertTrue(watch.watchOnly)
        assertFalse(bundled.libraries.first { it.id == "com.squareup.okhttp3:okhttp" }.watchOnly)
        // Platforms (BOMs) aren't libraries.
        assertFalse(ids.any { it.endsWith("-bom") })
        assertEquals(listOf("font:barlow", "font:jetbrains-mono", "icons:phosphor"), bundled.works.map { it.id })
    }

    @Test
    fun `every license has its text, or is terms on the web`() {
        for (c in bundled.works + bundled.libraries) {
            assertTrue("${c.id} has a license", c.licenses.isNotEmpty())
            for (l in c.licenses) {
                assertTrue("${c.id}: ${l.name} has its text or its address", !l.text.isNullOrBlank() || !l.url.isNullOrBlank())
            }
        }
        val okhttp = bundled.libraries.first { it.id == "com.squareup.okhttp3:okhttp" }.licenses.single()
        assertEquals("Apache 2.0", okhttp.short)
        assertTrue(okhttp.text!!.contains("TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION"))
        assertEquals("Terms", bundled.libraries.first { it.id == "com.garmin.connectiq:ciq-companion-app-sdk" }.licenses.single().short)
    }

    @Test
    fun `a license naming its copyright holder has the library's own text`() {
        val placeholders = listOf("<year>", "<copyright holders>", "<OWNER>", "<ORGANIZATION>", "[yyyy]", "[name of copyright owner]")
        for (c in bundled.works + bundled.libraries) {
            for (l in c.licenses) {
                val text = l.text ?: continue
                if (l.short in setOf("MIT", "ISC") || l.short.startsWith("BSD") || l.short.startsWith("OFL")) {
                    assertTrue("${c.id}: its own copyright line (assets/licenses/libraries/${c.id.replace(':', '_')}.txt)", text.contains("Copyright", ignoreCase = true))
                    // At its head, where a template's copyright line is (MapLibre's own copies other licenses' appendices further on).
                    assertFalse("${c.id}: no template left in it", placeholders.any { text.take(400).contains(it, ignoreCase = true) })
                }
            }
        }
        assertTrue(bundled.find("org.maplibre.gl:android-sdk")!!.licenses.single().text!!.contains("MapLibre contributors"))
        assertTrue(bundled.find("font:barlow")!!.licenses.single().text!!.startsWith("Copyright 2017 The Barlow Project Authors"))
    }

    @Test
    fun `a library's NOTICE comes with it`() {
        assertTrue(bundled.find("androidx.concurrent:concurrent-futures-ktx")!!.notice!!.contains("JetBrains"))
    }

    @Test
    fun `a license's text is set as paragraphs for the phone`() {
        val p = Licenses.paragraphs(
            """
            ---------------------------------
            SIL OPEN FONT LICENSE Version 1.1
            ---------------------------------

            PREAMBLE
            The goals of the Open Font License (OFL) are to stimulate worldwide
            development of collaborative font projects.

            ### [kdbush.hpp](https://github.com/mourner/kdbush.hpp) by Vladimir Agafonkin

            ```
            Copyright (c) 2016,  Vladimir Agafonkin
            Permission to use, copy:
            ```
            MapLibre Native Android uses portions of Activity.
            URL: [https://developer.android.com](https://developer.android.com)
            License: The Apache Software License
            * Redistributions of source code must retain
              the above copyright notice.
            * Redistributions in binary form
            """.trimIndent(),
        )
        assertEquals("SIL OPEN FONT LICENSE Version 1.1", p[0].text)
        assertFalse(p[0].heading)
        assertEquals("PREAMBLE", p[1].text)
        assertTrue(p[1].heading)
        assertEquals("The goals of the Open Font License (OFL) are to stimulate worldwide development of collaborative font projects.", p[2].text)
        assertFalse(p[2].heading)
        assertEquals("kdbush.hpp by Vladimir Agafonkin", p[3].text)
        assertTrue(p[3].heading)
        assertEquals(
            "Copyright (c) 2016, Vladimir Agafonkin Permission to use, copy: MapLibre Native Android uses portions of Activity.\n" +
                "URL: https://developer.android.com\nLicense: The Apache Software License\n" +
                "* Redistributions of source code must retain the above copyright notice.\n* Redistributions in binary form",
            p[4].text,
        )
        assertEquals(5, p.size)
        // A disclaimer in capitals stays a paragraph.
        assertFalse(Licenses.paragraphs("THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED.").first().heading)
        assertTrue(Licenses.paragraphs("END OF TERMS AND CONDITIONS").single().heading)
    }
}
