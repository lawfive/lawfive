package app.lawfive.data

import android.content.Context
import app.lawfive.schema.QuizBank
import app.lawfive.schema.QuizQuestion
import kotlinx.serialization.json.Json
import java.io.File
import kotlin.random.Random

// The Laws of the Game quiz (QUIZ-1 to QUIZ-7), by the same rules as schema/src/quiz.ts. The questions
// come from the server when it can be reached; otherwise the last copy, else the one built in, so
// it works at a ground without signal.

private val quizJson = Json { ignoreUnknownKeys = true }

fun parseQuizBank(text: String): QuizBank = quizJson.decodeFromString(QuizBank.serializer(), text)

class QuizStore(private val context: Context, private val api: Api) {
    private val cache get() = File(context.filesDir, "quiz-en.json")

    /** The last copy from the server, else the one built in. */
    fun local(): QuizBank {
        val saved = runCatching { parseQuizBank(cache.readText()) }.getOrNull()
        return saved ?: parseQuizBank(context.assets.open("questions-en.json").bufferedReader().use { it.readText() })
    }

    /** The server's questions, kept for next time; null with no signal, or a server without them. */
    suspend fun refresh(): QuizBank? = runCatching {
        val answer = api.call("GET", "/v1/quiz") ?: return null
        val text = answer.toString()
        val bank = parseQuizBank(text)
        cache.writeText(text)
        bank
    }.getOrNull()
}

val quizDifficulties = listOf(
    Triple("easy", "Easy", "The basics of the Laws"),
    Triple("medium", "Medium", "For referees with a few seasons in"),
    Triple("hard", "Hard", "The ones that catch people out"),
    Triple("mixed", "Mixed", "A bit of everything"),
)
val quizCounts = listOf(5, 10, 15, 20)

fun quizPool(bank: QuizBank, difficulty: String) =
    bank.questions.filter { it.status == "active" && (difficulty == "mixed" || it.difficulty == difficulty) }

/** QUIZ-2: an attempt's questions, at random, with their options shuffled too, except true or false. */
fun pickQuiz(bank: QuizBank, difficulty: String, count: Int, random: Random = Random.Default): List<QuizQuestion> =
    quizPool(bank, difficulty).shuffled(random).take(count).map { q ->
        if (q.type == "true_false") q else q.copy(options = q.options.shuffled(random))
    }

/** Right only with every correct option and no others. */
fun quizAnswerIsRight(question: QuizQuestion, picked: List<String>): Boolean =
    question.options.filter { it.correct }.map { it.id }.toSet() == picked.toSet()

/** "Law 12.4 – Fouls and Misconduct", or a protocol's title, with where to read it. */
fun quizReference(bank: QuizBank, question: QuizQuestion): Pair<String, String>? {
    val ref = question.refs.firstOrNull() ?: return null
    ref.protocol?.let { id ->
        val protocol = bank.protocols.firstOrNull { it.id == id } ?: return null
        val url = protocol.url ?: bank.laws.firstOrNull { it.law.toInt() == protocol.relatedLaws.firstOrNull()?.toInt() }?.url ?: return null
        return protocol.title to url
    }
    val law = bank.laws.firstOrNull { it.law.toInt() == ref.law } ?: return null
    return "Law ${law.law}${ref.section?.let { ".$it" } ?: ""} – ${law.title}" to law.url
}

data class QuizVerdict(val title: String, val line: String, val card: String?)

/** QUIZ-5: the same list as schema/src/quiz.ts's quizVerdicts (a test checks). */
val quizVerdicts = listOf(
    Triple(1.0, "Flawless" to null, listOf("Full marks. Not one decision to review.", "Perfect. The assessor put their pen down halfway through.")),
    Triple(0.8, "Great" to null, listOf("That's a top-marks assessment. Book the final.", "You clearly read the Laws, and not just the bit about offside.")),
    Triple(0.6, "Solid" to null, listOf("Good enough for the middle, with a quick read before kickoff.", "A safe pair of hands, and a few missed calls nobody saw.")),
    Triple(0.4, "Needs improvement" to "yellow", listOf("The assessor has a few notes. It's a long few notes.", "Consider this a caution. The Laws are free to read.")),
    Triple(0.2, "Rough day" to "yellow", listOf("Somewhere, a U10 coach is saying they could've told you that.", "Even the parents behind the rope are checking the rulebook now.")),
    Triple(0.0, "Sent off" to "red", listOf("Straight red. Did you read the Laws, or just the team sheet?", "Bold answers. Wrong, but bold. See you at the refresher course.")),
)

fun quizVerdict(share: Double, random: Random = Random.Default): QuizVerdict {
    val v = quizVerdicts.firstOrNull { share >= it.first } ?: quizVerdicts.last()
    return QuizVerdict(v.second.first, v.third.random(random), v.second.second)
}

data class QuizLawRow(val law: Int, val title: String, val url: String, val right: Int, val total: Int)

/** QUIZ-5: how an attempt went per Law, weakest first, from each question's main reference. */
fun quizByLaw(bank: QuizBank, results: List<Pair<QuizQuestion, Boolean>>): List<QuizLawRow> {
    val rows = linkedMapOf<Int, QuizLawRow>()
    for ((question, right) in results) {
        val ref = question.refs.firstOrNull()
        val number = ref?.law ?: bank.protocols.firstOrNull { it.id == ref?.protocol }?.relatedLaws?.firstOrNull()?.toInt()
        val law = bank.laws.firstOrNull { it.law.toInt() == number } ?: continue
        val row = rows[law.law.toInt()] ?: QuizLawRow(law.law.toInt(), law.title, law.url, 0, 0)
        rows[law.law.toInt()] = row.copy(right = row.right + if (right) 1 else 0, total = row.total + 1)
    }
    return rows.values.sortedWith(compareBy({ it.right.toDouble() / it.total }, { it.law }))
}
