package app.lawfive.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

// The phone's copy of the account (APP-3): every record as the server sent it (its JSON kept whole,
// so fields this version of the app doesn't know survive a save), and the outbox of changes made
// on the phone that haven't reached the server yet.

@Entity(tableName = "records", primaryKeys = ["collection", "id"])
data class RecordRow(
    /** The API's collection: matches, venues, referees… */
    val collection: String,
    val id: String,
    val json: String,
    /** The version the server last gave it; 0 for one made on the phone and not sent yet. */
    val version: Long,
    val deleted: Boolean,
)

@Entity(tableName = "outbox")
data class OutboxRow(
    @PrimaryKey(autoGenerate = true) val seq: Long = 0,
    val collection: String,
    val id: String,
    /** put or delete. */
    val op: String,
    /** The record as changed on the phone (for put). */
    val json: String?,
    /** The record as it was before the phone changed it, for merging with a newer copy; null for a new one. */
    val base: String?,
    val createdAt: Long,
)

@Dao
interface RecordDao {
    @Query("SELECT * FROM records WHERE collection = :collection AND deleted = 0")
    fun observe(collection: String): Flow<List<RecordRow>>

    @Query("SELECT * FROM records WHERE collection = :collection AND id = :id")
    fun observeOne(collection: String, id: String): Flow<RecordRow?>

    @Query("SELECT * FROM records WHERE collection = :collection AND id = :id")
    suspend fun get(collection: String, id: String): RecordRow?

    @Query("SELECT * FROM records WHERE collection = :collection AND deleted = 0")
    suspend fun all(collection: String): List<RecordRow>

    @Upsert
    suspend fun upsert(rows: List<RecordRow>)

    @Query("DELETE FROM records WHERE collection = :collection AND id = :id")
    suspend fun remove(collection: String, id: String)

    @Query("DELETE FROM records")
    suspend fun clear()
}

@Dao
interface OutboxDao {
    @Query("SELECT * FROM outbox ORDER BY seq")
    suspend fun all(): List<OutboxRow>

    @Query("SELECT COUNT(*) FROM outbox")
    fun count(): Flow<Int>

    @Query("SELECT * FROM outbox WHERE collection = :collection AND id = :id ORDER BY seq LIMIT 1")
    suspend fun pending(collection: String, id: String): OutboxRow?

    @Query("SELECT collection || '/' || id FROM outbox")
    suspend fun pendingKeys(): List<String>

    @Upsert
    suspend fun upsert(row: OutboxRow)

    @Query("DELETE FROM outbox WHERE seq = :seq")
    suspend fun remove(seq: Long)

    @Query("DELETE FROM outbox WHERE collection = :collection AND id = :id")
    suspend fun removeFor(collection: String, id: String)

    @Query("DELETE FROM outbox")
    suspend fun clear()
}

@Database(entities = [RecordRow::class, OutboxRow::class], version = 1, exportSchema = true)
abstract class LawFiveDb : RoomDatabase() {
    abstract fun records(): RecordDao
    abstract fun outbox(): OutboxDao

    companion object {
        fun open(context: Context): LawFiveDb = Room.databaseBuilder(context, LawFiveDb::class.java, "lawfive.db").build()
    }
}
