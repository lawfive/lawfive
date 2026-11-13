package app.lawfive

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import androidx.core.net.toUri

/** Health Connect's "why it's asked" link (ACT-1): the privacy policy, which says what's kept and why. */
class HealthRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startActivity(Intent(Intent.ACTION_VIEW, "https://lawfive.app/privacy.html".toUri()))
        finish()
    }
}
