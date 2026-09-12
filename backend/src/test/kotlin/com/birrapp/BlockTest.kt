package com.birrapp

import com.birrapp.auth.PeopleRepo
import com.birrapp.core.ApiException
import com.birrapp.photos.PhotoRepo
import com.birrapp.photos.R2
import com.birrapp.ratings.NewCommentRequest
import com.birrapp.ratings.RatingRepo
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Perfil ajeno y bloqueo entre personas (BIR-6 y BIR-17).
 *
 * Son las dos caras de lo mismo: el ban es la herramienta del moderador y el
 * bloqueo la del usuario. Lo que se prueba acá es que el bloqueo esconda de
 * verdad —en las dos direcciones— y que el perfil ajeno no filtre lo que no
 * tiene que mostrar.
 */
class BlockTest {

    private val lat = -34.6037
    private val lng = -58.3816

    private val people by lazy { PeopleRepo(TestDb.db) }
    private val ratings by lazy { RatingRepo(TestDb.db) }
    private val photos by lazy {
        PhotoRepo(TestDb.db, R2("", "", "", "", ""))
    }

    @BeforeTest fun setup() = TestDb.reset()

    private fun comentar(bar: Long, quien: Long, texto: String) =
        ratings.addComment(NewCommentRequest(bar, "rubia", body = texto), quien)

    @Test
    fun `bloquear esconde los comentarios en las dos direcciones`() {
        val a = TestDb.insertUser("a")
        val b = TestDb.insertUser("b")
        val c = TestDb.insertUser("c")
        val bar = TestDb.insertBar("El Bar", lat, lng)

        comentar(bar, a, "hola")
        comentar(bar, b, "qué decís")
        comentar(bar, c, "ajeno a todo")

        people.setBlocked(a, b, on = true)

        // A no ve a B.
        val paraA = ratings.comments(bar, "rubia", null, a).map { it.authorName }
        assertEquals(setOf("a", "c"), paraA.toSet())
        assertEquals(2, paraA.size)

        // Y B tampoco ve a A: una sola dirección deja a quien bloqueó igual de
        // expuesto — el otro sigue leyéndolo y sigue teniendo a quién
        // responderle.
        val paraB = ratings.comments(bar, "rubia", null, b).map { it.authorName }
        assertFalse(paraB.contains("a"), "B no tiene que ver a A")
        assertTrue(paraB.contains("b"))

        // C no tiene nada que ver y ve todo.
        assertEquals(3, ratings.comments(bar, "rubia", null, c).size)
    }

    @Test
    fun `sin sesión no hay bloqueos y se ve todo`() {
        val a = TestDb.insertUser("a")
        val b = TestDb.insertUser("b")
        val bar = TestDb.insertBar("El Bar", lat, lng)
        comentar(bar, a, "uno")
        comentar(bar, b, "dos")
        people.setBlocked(a, b, on = true)

        assertEquals(2, ratings.comments(bar, "rubia", null, null).size)
    }

    @Test
    fun `bloquear también esconde las fotos`() {
        val a = TestDb.insertUser("a")
        val b = TestDb.insertUser("b")
        val bar = TestDb.insertBar("El Bar", lat, lng)
        TestDb.insertPhoto(bar, "rubia", a)
        TestDb.insertPhoto(bar, "rubia", b)

        assertEquals(2, photos.forBar(bar, a).size)
        people.setBlocked(a, b, on = true)
        assertEquals(1, photos.forBar(bar, a).size)
        assertEquals(listOf("a"), photos.forBar(bar, a).map { it.authorName })
    }

    @Test
    fun `desbloquear devuelve lo escondido, y bloquear dos veces no rompe`() {
        val a = TestDb.insertUser("a")
        val b = TestDb.insertUser("b")
        val bar = TestDb.insertBar("El Bar", lat, lng)
        comentar(bar, b, "hola")

        people.setBlocked(a, b, on = true)
        people.setBlocked(a, b, on = true)
        assertEquals(0, ratings.comments(bar, "rubia", null, a).size)

        people.setBlocked(a, b, on = false)
        people.setBlocked(a, b, on = false)
        assertEquals(1, ratings.comments(bar, "rubia", null, a).size)
    }

    @Test
    fun `no se puede bloquear a uno mismo ni a quien no existe`() {
        val a = TestDb.insertUser("a")
        assertFailsWith<ApiException> { people.setBlocked(a, a, on = true) }
        assertFailsWith<ApiException> { people.setBlocked(a, 999_999, on = true) }
    }

    @Test
    fun `la lista de bloqueados es para poder deshacerlo`() {
        val a = TestDb.insertUser("a")
        val b = TestDb.insertUser("b")
        assertTrue(people.blocked(a).isEmpty())

        people.setBlocked(a, b, on = true)
        assertEquals(listOf("b"), people.blocked(a).map { it.displayName })
        assertEquals(true, people.blocked(a).single().blocked)
    }

    // ---------- perfil ajeno ----------

    @Test
    fun `el perfil ajeno cuenta los aportes y no muestra el email`() {
        val autor = TestDb.insertUser("autora")
        val mirando = TestDb.insertUser("mirando")
        val bar = TestDb.insertBar("El Bar", lat, lng, createdBy = autor)
        TestDb.insertPrice(bar, "rubia", 5000.0, daysAgo = 1, userId = autor)
        TestDb.insertPrice(bar, "ipa", 6000.0, daysAgo = 1, userId = autor, isConfirmation = true)
        TestDb.insertPhoto(bar, "rubia", autor)
        comentar(bar, autor, "muy buena")

        val p = people.profile(autor, mirando, asModerator = false)
        assertEquals("autora", p.displayName)
        assertEquals(1, p.prices, "las confirmaciones no cuentan como precio cargado")
        assertEquals(1, p.bars)
        assertEquals(1, p.photos)
        assertEquals(1, p.comments)
        assertEquals(false, p.blocked)
        // El DTO no tiene campo de email: es una garantía de tipo, no una
        // decisión de cada consulta.
        assertNull(p.banned, "que alguien esté baneado no es información pública")
        assertNull(p.role)
    }

    @Test
    fun `sólo un moderador ve el ban y el rol`() {
        val quien = TestDb.insertUser("quien")
        val mod = TestDb.insertUser("mod", role = "moderator")

        assertNull(people.profile(quien, mod, asModerator = false).banned)
        assertEquals(false, people.profile(quien, mod, asModerator = true).banned)
        assertEquals("user", people.profile(quien, mod, asModerator = true).role)
    }

    @Test
    fun `mirando sin sesión no se sabe si está bloqueada`() {
        val quien = TestDb.insertUser("quien")
        assertNull(
            people.profile(quien, null, asModerator = false).blocked,
            "sin sesión no hay bloqueo que informar, y false sería mentir",
        )
    }

    @Test
    fun `pedir el perfil de alguien que no existe es un 404`() {
        assertFailsWith<ApiException> { people.profile(999_999, null, asModerator = false) }
    }
}
