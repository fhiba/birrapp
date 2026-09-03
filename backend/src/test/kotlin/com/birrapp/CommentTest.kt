package com.birrapp

import com.birrapp.core.ApiException
import com.birrapp.ratings.NewCommentRequest
import com.birrapp.ratings.NewRatingRequest
import com.birrapp.ratings.RatingRepo
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Las dos reglas que separan la nota del comentario.
 *
 * Una nota por persona y por birra, editable. Comentarios, los que quiera. Y
 * lo que cada uno escribió lo puede borrar, sin que eso le toque el voto.
 */
class CommentTest {
    private val lat = -34.6037
    private val lng = -58.3816
    private val repo by lazy { RatingRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    @Test
    fun `una persona puede dejar varios comentarios sobre la misma birra`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)

        assertTrue(repo.addComment(NewCommentRequest(bar, "ipa", "antares", "Estaba impecable"), u) > 0)
        repo.addComment(NewCommentRequest(bar, "ipa", "antares", "Hoy la sirvieron caliente"), u)

        val cs = repo.comments(bar, "ipa", "antares", viewerId = u)
        assertEquals(2, cs.size, "volver seis meses después es algo nuevo que decir")
    }

    @Test
    fun `la nota sigue siendo una sola y se pisa al cambiarla`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)

        repo.upsert(NewRatingRequest(bar, "ipa", "antares", 5), u)
        repo.upsert(NewRatingRequest(bar, "ipa", "antares", 2), u)

        assertEquals(
            listOf(2), repo.mine(bar, u).map { it.rating },
            "cinco votos propios inflarían el promedio: la nota se pisa, no se suma",
        )
    }

    @Test
    fun `borrar un comentario propio no toca la nota`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)

        repo.upsert(NewRatingRequest(bar, "ipa", "antares", 4), u)
        val id = repo.addComment(NewCommentRequest(bar, "ipa", "antares", "Buena"), u)

        assertTrue(repo.removeOwnComment(id, u))
        assertEquals(0, repo.comments(bar, "ipa", "antares", viewerId = u).size)
        assertEquals(
            listOf(4), repo.mine(bar, u).map { it.rating },
            "borrar lo que escribiste no es retirar tu voto",
        )
    }

    @Test
    fun `nadie puede borrar el comentario de otro`() {
        val autor = TestDb.insertUser("autor")
        val otro = TestDb.insertUser("otro")
        val bar = TestDb.insertBar("Prueba", lat, lng)

        val id = repo.addComment(NewCommentRequest(bar, "ipa", "antares", "Mío"), autor)

        assertTrue(
            !repo.removeOwnComment(id, otro),
            "la pertenencia va en el WHERE: un id ajeno no afecta ninguna fila",
        )
        assertEquals(1, repo.comments(bar, "ipa", "antares", viewerId = autor).size)
        assertTrue(repo.removeOwnComment(id, autor))
    }

    @Test
    fun `se puede comentar sin votar`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)

        repo.addComment(NewCommentRequest(bar, "ipa", "antares", "Sin puntaje"), u)

        val c = repo.comments(bar, "ipa", "antares", viewerId = u).single()
        assertNull(c.rating, "comentar y puntuar son dos acciones distintas")
        assertTrue(c.mine)
    }

    @Test
    fun `el comentario lleva la nota de su autor sobre esa birra y no sobre otra`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)

        repo.upsert(NewRatingRequest(bar, "ipa", "antares", 5), u)
        repo.upsert(NewRatingRequest(bar, "ipa", "berlina", 1), u)
        repo.addComment(NewCommentRequest(bar, "ipa", "antares", "Sobre la de Antares"), u)

        assertEquals(5, repo.comments(bar, "ipa", "antares", viewerId = u).single().rating)
    }

    @Test
    fun `rechaza comentarios vacios o demasiado largos`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)
        assertFailsWith<ApiException> {
            repo.addComment(NewCommentRequest(bar, "ipa", null, "   "), u)
        }
        assertFailsWith<ApiException> {
            repo.addComment(NewCommentRequest(bar, "ipa", null, "a".repeat(601)), u)
        }
    }
}
