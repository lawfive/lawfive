package app.lawfive.wear

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext

// The kickoff direction's compass (PRE-8, WCH-10). Headings are from magnetic north, as the watch has
// no location to correct them with; the arrows only compare headings from the same watch.

object Compass {
    /** A reading for testing on an emulator, whose sensors don't move. */
    var fake: Float? = null

    fun available(context: Context): Boolean {
        if (fake != null) return true
        val sensors = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        return sensors.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) != null
    }

    /** "N 12°", "SW 225°". */
    fun describe(heading: Float): String {
        val degrees = (Math.toDegrees(heading.toDouble()).toInt() % 360 + 360) % 360
        return listOf("N", "NE", "E", "SE", "S", "SW", "W", "NW")[((degrees + 22) % 360) / 45] + " $degrees°"
    }
}

/** The way 12 o'clock points while this is on screen, or null with no reading yet. */
@Composable
fun rememberHeading(): Float? {
    val context = LocalContext.current
    var heading by remember { mutableStateOf(Compass.fake) }
    DisposableEffect(Unit) {
        val sensors = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        val rotation = FloatArray(9)
        val angles = FloatArray(3)
        var gravity: FloatArray? = null
        var magnetic: FloatArray? = null
        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                val ok = when (event.sensor.type) {
                    Sensor.TYPE_ROTATION_VECTOR -> { SensorManager.getRotationMatrixFromVector(rotation, event.values); true }
                    else -> {
                        if (event.sensor.type == Sensor.TYPE_ACCELEROMETER) gravity = event.values.clone() else magnetic = event.values.clone()
                        val g = gravity
                        val m = magnetic
                        g != null && m != null && SensorManager.getRotationMatrix(rotation, null, g, m)
                    }
                }
                if (ok && Compass.fake == null) {
                    SensorManager.getOrientation(rotation, angles)
                    heading = normalizeHeading(angles[0])
                }
            }

            override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) = Unit
        }
        if (Compass.fake == null) {
            val vector = sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
            if (vector != null) {
                sensors.registerListener(listener, vector, SensorManager.SENSOR_DELAY_UI)
            } else {
                sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let { sensors.registerListener(listener, it, SensorManager.SENSOR_DELAY_UI) }
                sensors.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)?.let { sensors.registerListener(listener, it, SensorManager.SENSOR_DELAY_UI) }
            }
        }
        onDispose { sensors.unregisterListener(listener) }
    }
    return heading
}
