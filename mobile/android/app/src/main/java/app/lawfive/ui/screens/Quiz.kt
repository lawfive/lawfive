package app.lawfive.ui.screens

import android.content.Intent
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.heightIn
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.lawfive.ui.components.CardKind
import app.lawfive.ui.components.CardShape
import app.lawfive.ui.components.FitText
import app.lawfive.ui.components.WordFitText
import app.lawfive.ui.components.Slab
import app.lawfive.ui.components.SlabGround
import app.lawfive.ui.components.fixedSp
import app.lawfive.ui.components.slantShape
import app.lawfive.ui.theme.LfType
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import app.lawfive.schema.QuizBank
import app.lawfive.schema.QuizQuestion
import app.lawfive.data.QuizVerdict
import app.lawfive.data.pickQuiz
import app.lawfive.data.quizAnswerIsRight
import app.lawfive.data.quizByLaw
import app.lawfive.data.quizCounts
import app.lawfive.data.quizDifficulties
import app.lawfive.data.quizPool
import app.lawfive.data.quizReference
import app.lawfive.data.quizVerdict
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.components.Chip
import app.lawfive.ui.components.ChipTone
import app.lawfive.ui.components.Confirm
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.PrimaryButton
import app.lawfive.ui.components.Screen
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.theme.BarlowCondensed
import app.lawfive.ui.theme.colors
import app.lawfive.ui.components.hardDrop

// The Laws of the Game quiz (QUIZ-1 to QUIZ-7), as the web's: choose how hard and how long, answer,
// see how it went. Nothing about an attempt is saved (QUIZ-6); it's kept here so going to another
// tab and back doesn't lose it, and goes when the app closes.

// Internal (not private) so the snapshot tests can open the quiz at a question and at its result.
internal data class Attempt(
    val difficulty: String,
    val questions: List<QuizQuestion>,
    val index: Int = 0,
    /** What was picked, once the question is checked. */
    val answers: List<List<String>> = emptyList(),
    val verdict: QuizVerdict? = null,
) {
    val right get() = answers.indices.count { quizAnswerIsRight(questions[it], answers[it]) }
}

internal object Kept {
    var attempt by mutableStateOf<Attempt?>(null)
    var difficulty by mutableStateOf("easy")
    var count by mutableStateOf(10)
}

@Composable
fun QuizScreen() {
    val graph = LocalGraph.current
    var bank by remember { mutableStateOf<QuizBank?>(null) }
    var asking by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        // What's here straight away, then the server's if there's signal.
        bank = runCatching { kotlinx.coroutines.Dispatchers.IO.let { d -> kotlinx.coroutines.withContext(d) { graph.quiz.local() } } }.getOrNull()
        graph.quiz.refresh()?.let { bank = it }
    }
    val attempt = Kept.attempt
    val current = bank
    Screen(
        "Quiz", "How well do you know the Laws of the Game?", back = "More",
        actions = if (attempt == null) null else ({
            SecondaryButton("Start over", {
                if (attempt.verdict == null && attempt.answers.isNotEmpty()) asking = true else Kept.attempt = null
            }, icon = Ph.Restart)
        }),
    ) {
        item(key = "step") {
            if (current == null) {
                app.lawfive.ui.components.LoadingPitch()
            } else {
                // QUIZ-4: the next step comes in from the right as the last leaves to the left. Each
                // step draws its own attempt, so the one leaving keeps its question and answer.
                AnimatedContent(attempt, contentKey = { a ->
                    when {
                        a == null -> "setup"
                        a.verdict != null -> "results"
                        else -> "q${a.index}"
                    }
                }, transitionSpec = {
                    (slideInHorizontally(tween(280)) { it / 8 } + fadeIn(tween(280))) togetherWith
                        (slideOutHorizontally(tween(170)) { -it / 8 } + fadeOut(tween(170)))
                }, label = "quiz") { a ->
                    when {
                        a == null -> Setup(current)
                        a.verdict != null -> Results(current, a)
                        else -> Asking(current, a)
                    }
                }
            }
        }
    }
    if (asking) {
        Confirm("Start over?", "This attempt's score goes, and you choose again.", "Start over", dismiss = "Keep going", onConfirm = {
            asking = false
            Kept.attempt = null
        }, onDismiss = { asking = false })
    }
}

@Composable
private fun Label(text: String) {
    Text(text.uppercase(), style = MaterialTheme.typography.labelMedium, color = colors.muted, modifier = Modifier.padding(bottom = 8.dp))
}

@Composable
private fun Setup(bank: QuizBank) {
    val context = LocalContext.current
    val available = quizPool(bank, Kept.difficulty).size
    LfCard {
        Column(Modifier.padding(16.dp)) {
            Label("How hard?")
            quizDifficulties.chunked(2).forEach { row ->
                Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { (value, label, sub) ->
                        val on = Kept.difficulty == value
                        // DESIGN.md "Choice tiles": outlined on the panel; the chosen one lit on the board, chalk on near black with a hard drop.
                        val background by animateColorAsState(if (on) colors.board else colors.surface, label = "level")
                        Column(
                            Modifier.weight(1f).height(92.dp).choiceTile(on, background)
                                .clickable { Kept.difficulty = value }.padding(12.dp),
                        ) {
                            Text(label.uppercase(), style = MaterialTheme.typography.headlineSmall, color = if (on) colors.onBoardStrong else colors.text)
                            Text(sub, style = MaterialTheme.typography.bodySmall, color = if (on) colors.onBoardMuted else colors.muted)
                        }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            Label("How many questions?")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                quizCounts.forEach { n ->
                    val on = Kept.count == n
                    val enabled = n <= available
                    Box(
                        Modifier.weight(1f).height(48.dp).alpha(if (enabled) 1f else 0.4f)
                            .choiceTile(on, if (on) colors.board else colors.surface)
                            .clickable(enabled = enabled) { Kept.count = n },
                        contentAlignment = Alignment.Center,
                    ) { Text("$n", style = MaterialTheme.typography.headlineSmall, color = if (on) colors.onBoardStrong else colors.text) }
                }
            }
            Spacer(Modifier.height(18.dp))
            PrimaryButton("Start the quiz", {
                Kept.attempt = Attempt(Kept.difficulty, pickQuiz(bank, Kept.difficulty, minOf(Kept.count, available)))
            }, Modifier.fillMaxWidth(), icon = Ph.Play)
            Text(
                "Written for LawFive from the Laws of the Game ${bank.edition}. Not official, and not endorsed by The IFAB.",
                style = MaterialTheme.typography.bodySmall, color = colors.muted, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp).clickable { context.startActivity(Intent(Intent.ACTION_VIEW, bank.source.url.toUri())) },
            )
        }
    }
}

@Composable
private fun Asking(bank: QuizBank, attempt: Attempt) {
    val context = LocalContext.current
    val question = attempt.questions[attempt.index]
    val answered = attempt.answers.getOrNull(attempt.index)
    var picked by remember(question.id) { mutableStateOf(emptyList<String>()) }
    val multiple = question.type == "multiple"
    val shown = answered ?: picked
    val last = attempt.index + 1 >= attempt.questions.size
    Column {
        Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalAlignment = Alignment.Bottom) {
            Text("Question ${attempt.index + 1} of ${attempt.questions.size}", style = MaterialTheme.typography.bodyMedium, color = colors.muted, modifier = Modifier.weight(1f))
            AnimatedContent(attempt.right, transitionSpec = { scaleIn(tween(240)) togetherWith fadeOut(tween(80)) }, label = "tally") { right ->
                Text("$right", fontFamily = BarlowCondensed, style = MaterialTheme.typography.headlineSmall, color = colors.brandStrong)
            }
            Text(" correct", style = MaterialTheme.typography.bodyMedium, color = colors.muted)
        }
        Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            attempt.questions.forEachIndexed { i, q ->
                val a = attempt.answers.getOrNull(i)
                val color by animateColorAsState(
                    when {
                        a != null && quizAnswerIsRight(q, a) -> colors.brand
                        a != null -> colors.red
                        i == attempt.index -> colors.muted
                        else -> colors.border
                    }, label = "segment",
                )
                Box(Modifier.weight(1f).height(6.dp).background(color, RoundedCornerShape(3.dp)))
            }
        }
        LfCard {
            Column(Modifier.padding(16.dp)) {
                if (multiple) {
                    Chip("Select all that apply", ChipTone.Blue)
                    Spacer(Modifier.height(10.dp))
                }
                Text(question.question, style = MaterialTheme.typography.titleLarge, color = colors.text)
                Spacer(Modifier.height(14.dp))
                question.options.forEach { option ->
                    val chosen = shown.contains(option.id)
                    OptionRow(option.text, option.explanation, multiple, chosen, answered != null, option.correct) {
                        if (answered == null) picked = if (multiple) (if (chosen) picked - option.id else picked + option.id) else listOf(option.id)
                    }
                    Spacer(Modifier.height(8.dp))
                }
                AnimatedVisibility(answered != null, enter = fadeIn() + expandVertically()) {
                    val correct = answered != null && quizAnswerIsRight(question, answered)
                    Column(Modifier.padding(top = 6.dp)) {
                        Text(if (correct) "Correct" else "Not quite", fontFamily = BarlowCondensed, style = MaterialTheme.typography.headlineSmall, color = if (correct) colors.brandStrong else colors.redText)
                        quizReference(bank, question)?.let { (label, url) ->
                            Text(label, style = MaterialTheme.typography.bodySmall, color = colors.brandStrong, modifier = Modifier.padding(top = 2.dp).clickable { context.startActivity(Intent(Intent.ACTION_VIEW, url.toUri())) })
                        }
                    }
                }
                Spacer(Modifier.height(14.dp))
                if (answered == null) {
                    PrimaryButton("Check answer", { Kept.attempt = attempt.copy(answers = attempt.answers + listOf(picked)) }, Modifier.fillMaxWidth(), enabled = picked.isNotEmpty())
                } else {
                    PrimaryButton(if (last) "See how you did" else "Next question", {
                        Kept.attempt = if (last) attempt.copy(verdict = quizVerdict(attempt.right.toDouble() / attempt.questions.size)) else attempt.copy(index = attempt.index + 1)
                    }, Modifier.fillMaxWidth())
                }
            }
        }
    }
}

@Composable
private fun OptionRow(text: String, why: String, multiple: Boolean, chosen: Boolean, answered: Boolean, correct: Boolean, onClick: () -> Unit) {
    val state = when {
        !answered -> if (chosen) "picked" else ""
        correct -> "right"
        chosen -> "wrong"
        else -> "out"
    }
    val background by animateColorAsState(when (state) { "right" -> colors.brandSoft; "wrong" -> colors.redSoft; else -> colors.surface }, label = "option")
    val edge by animateColorAsState(when (state) { "picked", "right" -> colors.brand; "wrong" -> colors.red; else -> colors.border }, label = "edge")
    val fill = when (state) { "picked", "right" -> colors.brand; "wrong" -> colors.red; else -> Color.Transparent }
    val shape = RoundedCornerShape(10.dp)
    Column(
        Modifier.fillMaxWidth().alpha(if (state == "out") 0.6f else 1f).background(background, shape)
            .border(if (state == "picked") 2.dp else 1.dp, edge, shape).clickable(enabled = !answered, onClick = onClick).padding(12.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            val markShape = if (multiple) RoundedCornerShape(5.dp) else CircleShape
            Box(
                Modifier.padding(top = 1.dp).size(20.dp).background(fill, markShape).border(1.5.dp, if (fill == Color.Transparent) colors.muted else fill, markShape),
                contentAlignment = Alignment.Center,
            ) {
                if (state == "picked" || state == "right") PhIcon(Ph.Check, size = 13.dp, tint = colors.onBrand)
                if (state == "wrong") PhIcon(Ph.Close, size = 13.dp, tint = Color.White)
            }
            Text(text, style = MaterialTheme.typography.bodyLarge, color = colors.text)
        }
        AnimatedVisibility(answered && (correct || chosen), enter = fadeIn() + expandVertically()) {
            Text(
                (if (correct && multiple && !chosen) "You missed this one. " else "") + why,
                style = MaterialTheme.typography.bodyMedium, color = colors.text, modifier = Modifier.padding(start = 30.dp, top = 6.dp),
            )
        }
    }
}

@Composable
private fun Results(bank: QuizBank, attempt: Attempt) {
    val context = LocalContext.current
    val verdict = attempt.verdict ?: return
    val total = attempt.questions.size
    val results = attempt.questions.indices.map { attempt.questions[it] to quizAnswerIsRight(attempt.questions[it], attempt.answers[it]) }
    // The score counts up as it appears (WEB-1).
    val count = remember { Animatable(0f) }
    LaunchedEffect(Unit) { count.animateTo(attempt.right.toFloat(), tween(700, delayMillis = 150)) }
    val share = attempt.right.toFloat() / total
    val c = colors
    Column {
        // WEB-28: the score on a slab cut on the diagonal, a card dealt beside a low one; the Laws on a chalk panel's slab.
        val level = quizDifficulties.firstOrNull { it.first == attempt.difficulty }?.second
        Slab("Your score", tag = listOfNotNull(level, "$total\u00A0questions").joinToString(" · "), icon = Ph.Quiz, cut = true, modifier = Modifier.padding(top = 12.dp)) {
            Row(Modifier.fillMaxWidth()) {
                Column(Modifier.weight(1f).clearAndSetSemantics { contentDescription = "${attempt.right} of $total right" }) {
                    val score = buildAnnotatedString {
                        append("${count.value.toInt()}")
                        withStyle(SpanStyle(fontSize = 0.36.em, color = c.onBoardMuted)) { append(" / $total") }
                    }
                    FitText("", LfType.display(fixedSp(if (narrow()) 76.dp else 96.dp), c.onBoardStrong, 0.9.em), Modifier.padding(end = 4.dp), min = 40.sp, annotated = score)
                    // As long as the share right (at least a sliver), as the website's.
                    Box(
                        Modifier.padding(top = 14.dp).height(12.dp).layout { m, k ->
                            val w = maxOf(14.dp.roundToPx(), (minOf(330.dp.toPx(), k.maxWidth * 0.7f) * share).toInt())
                            val p = m.measure(androidx.compose.ui.unit.Constraints.fixed(w, 12.dp.roundToPx()))
                            layout(w, p.height) { p.place(0, 0) }
                        }.clip(slantShape(left = 5.dp, right = 5.dp)).background(c.boardAccent),
                    )
                }
                verdict.card?.let { card ->
                    CardShape(if (card == "red") CardKind.Red else CardKind.Yellow, if (narrow()) 64.dp else 82.dp, if (narrow()) 88.dp else 112.dp, Modifier.padding(start = 12.dp, end = 6.dp, top = 4.dp))
                }
            }
            WordFitText(verdict.title.uppercase(), LfType.display(34.sp, c.onBoardStrong, 34.sp), Modifier.padding(top = 22.dp, end = 4.dp).semantics { heading() })
            Text(verdict.line, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium), color = c.muted, modifier = Modifier.padding(top = 6.dp))
            FlowRow(Modifier.padding(top = 18.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                PrimaryButton("Go again", { Kept.attempt = Attempt(attempt.difficulty, pickQuiz(bank, attempt.difficulty, total)) }, icon = Ph.Restart)
                SecondaryButton("Change the settings", { Kept.attempt = null })
            }
        }
        Slab("By Law", tag = "Weakest first", ground = SlabGround.Panel, modifier = Modifier.padding(top = 30.dp)) {
            quizByLaw(bank, results).forEach { law ->
                val fill = remember { Animatable(0f) }
                LaunchedEffect(Unit) { fill.animateTo(law.right.toFloat() / law.total, tween(600, delayMillis = 250)) }
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 44.dp).clickable { context.startActivity(Intent(Intent.ACTION_VIEW, law.url.toUri())) }.padding(vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text("Law ${law.law}: ${law.title}", style = MaterialTheme.typography.bodyMedium, color = colors.text, maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Box(Modifier.width(60.dp).height(6.dp).background(colors.border, RoundedCornerShape(3.dp))) {
                        Box(Modifier.fillMaxWidth(fill.value).height(6.dp).background(colors.brand, RoundedCornerShape(3.dp)))
                    }
                    Text("${law.right}/${law.total}", fontFamily = BarlowCondensed, style = MaterialTheme.typography.titleMedium, color = colors.text)
                }
            }
        }
        val missed = results.filter { !it.second }.map { it.first }
        if (missed.isNotEmpty()) {
            Spacer(Modifier.height(24.dp))
            LfCard {
                Column(Modifier.padding(16.dp)) {
                    Label("What you missed")
                    missed.forEachIndexed { i, q ->
                        if (i > 0) Box(Modifier.fillMaxWidth().padding(vertical = 10.dp).height(1.dp).background(colors.border))
                        Text(q.question, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Bold), color = colors.text)
                        q.options.filter { it.correct }.forEach { o ->
                            Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                PhIcon(Ph.Check, size = 14.dp, tint = colors.brandStrong, modifier = Modifier.padding(top = 3.dp))
                                Column {
                                    Text(o.text, style = MaterialTheme.typography.bodyMedium, color = colors.text)
                                    Text(o.explanation, style = MaterialTheme.typography.bodySmall, color = colors.muted)
                                }
                            }
                        }
                        quizReference(bank, q)?.let { (label, url) ->
                            Text(label, style = MaterialTheme.typography.bodySmall, color = colors.brandStrong, modifier = Modifier.padding(top = 6.dp).clickable { context.startActivity(Intent(Intent.ACTION_VIEW, url.toUri())) })
                        }
                    }
                }
            }
        }
    }
}

/** The narrowest phones, where the score and its card step down, as the website's. */
@Composable
private fun narrow() = androidx.compose.ui.platform.LocalConfiguration.current.screenWidthDp <= 380

/** A choice tile (DESIGN.md "Choice tiles"): a 2 dp outline on the panel; chosen, lit on the board with a hard drop (a mint edge at night). */
@Composable
private fun Modifier.choiceTile(on: Boolean, background: androidx.compose.ui.graphics.Color): Modifier {
    val shape = RoundedCornerShape(6.dp)
    val c = colors
    return this
        .then(if (on) Modifier.hardDrop(if (c.dark) androidx.compose.ui.graphics.Color.Transparent else c.board.copy(alpha = 0.35f), shape) else Modifier)
        .background(background, shape)
        .border(if (on) 1.dp else 2.dp, if (on) (if (c.dark) c.boardAccent else c.board) else c.borderInput, shape)
}
