package app.lawfive

import app.lawfive.data.json
import app.lawfive.schema.VenueMergeDraft
import app.lawfive.schema.VenueMergeDraftPitchesItem
import app.lawfive.schema.VenueMergePreview
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// DUP-11, DUP-12: the phone only sends the choices so far and shows the server's preview, so what
// it must get right is the shapes: a draft without what isn't chosen yet, and a preview read whole.
class MergingTest {
    @Test
    fun `a draft leaves out what isn't chosen`() {
        val draft = VenueMergeDraft(from = listOf("b"), pitches = listOf(VenueMergeDraftPitchesItem(id = "p", name = "")))
        assertEquals("""{"from":["b"],"pitches":[{"id":"p","name":""}]}""", json.encodeToString(VenueMergeDraft.serializer(), draft))
    }

    @Test
    fun `a preview with a problem has nothing to merge`() {
        val preview = json.decodeFromString(VenueMergePreview.serializer(), """
            {"venues":[{"id":"a","name":"Twin Creeks","aliases":[],"pitches":2,"matches":{"played":3,"upcoming":1}}],
             "names":["Twin Creeks","Twin Creeks Park"],"name":"Twin Creeks","places":[],
             "pitches":[{"id":"p","name":"Field 1","matches":0,"corners":0,"onMap":true,"check":true,"why":"Same name as Field 1, 712 m away",
               "choice":{"name":"Field 1"},"targets":[{"id":"k","name":"Field 3"}],"problem":"Another pitch has this name; choose a new one"}],
             "notes":[],"problems":1,"together":{"played":3,"upcoming":1}}
        """)
        assertEquals(1L, preview.problems)
        assertEquals("Another pitch has this name; choose a new one", preview.pitches[0].problem)
        assertNull(preview.merge)
    }
}
