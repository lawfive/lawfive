package app.lawfive

import app.lawfive.data.parseQuizBank
import app.lawfive.data.pickQuiz
import app.lawfive.data.quizAnswerIsRight
import app.lawfive.data.quizByLaw
import app.lawfive.data.quizReference
import app.lawfive.data.quizVerdict
import app.lawfive.data.quizVerdicts
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

// QUIZ-1 to QUIZ-5: the same rules as schema/test/quiz.test.ts, on the real questions.
class QuizTest {
    private val bank = parseQuizBank(File("../../../schema/quiz/questions-en.json").readText())

    @Test fun picksAtRandomAtTheDifficulty() {
        val quiz = pickQuiz(bank, "easy", 10)
        assertEquals(10, quiz.size)
        assertEquals(10, quiz.map { it.id }.toSet().size)
        assertTrue(quiz.all { it.difficulty == "easy" })
        assertNotEquals(pickQuiz(bank, "hard", 20).map { it.id }, pickQuiz(bank, "hard", 20).map { it.id })
        assertEquals(bank.questions.size, pickQuiz(bank, "mixed", 500).size)
        pickQuiz(bank, "mixed", 500).filter { it.type == "true_false" }.forEach { assertEquals(listOf("True", "False"), it.options.map { o -> o.text }) }
    }

    @Test fun rightOnlyWithAllTheCorrectOptions() {
        val q = bank.questions.first { it.type == "multiple" }
        val right = q.options.filter { it.correct }.map { it.id }
        assertTrue(quizAnswerIsRight(q, right))
        assertTrue(quizAnswerIsRight(q, right.reversed()))
        assertFalse(quizAnswerIsRight(q, right.drop(1)))
        q.options.firstOrNull { !it.correct }?.let { assertFalse(quizAnswerIsRight(q, right + it.id)) }
    }

    @Test fun everyQuestionHasAReference() {
        bank.questions.forEach { assertTrue(it.id, quizReference(bank, it) != null) }
        val q = bank.questions.first { it.refs.first().section != null && it.refs.first().law != null }
        assertTrue(quizReference(bank, q)!!.first.startsWith("Law ${q.refs.first().law}.${q.refs.first().section} – "))
    }

    @Test fun verdictAndWeakestLaw() {
        assertEquals("Flawless", quizVerdict(1.0).title)
        assertEquals("Solid", quizVerdict(0.79).title)
        assertEquals("red", quizVerdict(0.0).card)
        val a = bank.questions.first { it.refs.first().law == 11 }
        val b = bank.questions.first { it.refs.first().law == 12 }
        assertEquals(listOf(12, 11), quizByLaw(bank, listOf(a to true, b to false)).map { it.law })
    }

    @Test fun theVerdictsAreTheWebs() {
        val web = File("../../../schema/src/quiz.ts").readText()
        for (v in quizVerdicts) {
            assertTrue(web.contains("\"${v.second.first}\""))
            v.third.forEach { assertTrue(it, web.contains(it)) }
        }
    }
}
