package com.birrapp

import com.birrapp.bars.BarRepo
import com.birrapp.core.ApiException
import com.birrapp.core.update
import com.birrapp.photos.PhotoRepo
import com.birrapp.photos.R2
import com.birrapp.ratings.NewRatingRequest
import com.birrapp.ratings.RatingRepo
import com.birrapp.ratings.RetractRatingRequest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Los dos lados del voto: el pulgar en las fotos (BIR-10) y poder retirar la
 * nota de una birra (BIR-11).
 */
class VoteTest {

    // R2 de mentira: acá nunca se sube nada, sólo se arman URLs públicas.
    private val r2 = R2("cuenta", "balde", "llave", "secreto", "https://fotos.test")
    private val photos by lazy { PhotoRepo(TestDb.db, r2) }
    private val ratings by lazy { RatingRepo(TestDb.db) }
    private val bars by lazy { BarRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    /** Retrasa una foto en el tiempo, para poder probar la foto del mes. */
    private fun backdate(photoId: Long, days: Int) = TestDb.db.conn {
        it.update(
            "UPDATE bar_photos SET created_at = now() - make_interval(days => ?) WHERE id = ?",
            days, photoId,
        )
    }

    // ---------- pulgares ----------

    @Test
    fun `el pulgar es un interruptor, y dos toques no dejan dos votos`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        val foto = TestDb.insertPhoto(bar, "ipa", u)

        assertEquals(1, photos.vote(foto, u, on = true))
        assertEquals(1, photos.vote(foto, u, on = true), "votar dos veces sigue siendo un voto")
        assertEquals(0, photos.vote(foto, u, on = false))
        assertEquals(0, photos.vote(foto, u, on = false), "sacarlo dos veces no rompe nada")
    }

    @Test
    fun `cada uno pone el suyo, y sólo ve el suyo marcado`() {
        val a = TestDb.insertUser("a")
        val b = TestDb.insertUser("b")
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        val foto = TestDb.insertPhoto(bar, "ipa", a)

        photos.vote(foto, a, on = true)
        assertEquals(2, photos.vote(foto, b, on = true))

        assertTrue(photos.forBar(bar, viewerId = a).single().votedByMe)
        assertEquals(2, photos.forBar(bar, viewerId = a).single().votes)
        // Sin sesión el conteo se ve igual; lo que no hay es voto propio.
        val anonima = photos.forBar(bar, viewerId = null).single()
        assertEquals(2, anonima.votes)
        assertFalse(anonima.votedByMe)
    }

    @Test
    fun `una foto bajada no se puede votar`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        val foto = TestDb.insertPhoto(bar, "ipa", u)
        photos.remove(foto)

        assertFailsWith<ApiException> { photos.vote(foto, u, on = true) }
        assertFailsWith<ApiException> { photos.vote(999_999, u, on = true) }
    }

    @Test
    fun `la foto del mes es la más votada del mes, y va primera`() {
        val a = TestDb.insertUser("a")
        val b = TestDb.insertUser("b")
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)

        val vieja = TestDb.insertPhoto(bar, "ipa", a)
        val ganadora = TestDb.insertPhoto(bar, "ipa", a)
        val nueva = TestDb.insertPhoto(bar, "ipa", b)

        // La vieja junta más pulgares que nadie, pero es de hace tres meses:
        // la carrera se reinicia, si no gana siempre la misma.
        backdate(vieja, days = 95)
        photos.vote(vieja, a, on = true)
        photos.vote(vieja, b, on = true)
        photos.vote(ganadora, a, on = true)

        val lista = photos.forBar(bar, viewerId = null)
        assertEquals(ganadora, lista.first().id, "la del mes va primera")
        assertTrue(lista.first().topOfMonth)
        assertEquals(1, lista.count { it.topOfMonth }, "hay una sola foto del mes")
        assertFalse(lista.single { it.id == vieja }.topOfMonth)
        assertFalse(lista.single { it.id == nueva }.topOfMonth)
    }

    @Test
    fun `sin un solo pulgar no hay foto del mes`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        TestDb.insertPhoto(bar, "ipa", u)
        TestDb.insertPhoto(bar, "rubia", u)

        val lista = photos.forBar(bar, viewerId = null)
        assertEquals(2, lista.size)
        assertTrue(lista.none { it.topOfMonth }, "destacar una foto que nadie votó no dice nada")
    }

    @Test
    fun `el repaso de fotos trae las últimas, con su contexto y sin las bajadas`() {
        val a = TestDb.insertUser("a")
        val b = TestDb.insertUser("b")
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)

        val vieja = TestDb.insertPhoto(bar, "rubia", a)
        val nueva = TestDb.insertPhoto(bar, "ipa", b)
        val bajada = TestDb.insertPhoto(bar, "ipa", a)
        backdate(vieja, days = 4)
        photos.vote(nueva, a, on = true)
        photos.remove(bajada)

        val lista = photos.recent()
        assertEquals(listOf(nueva, vieja), lista.map { it.id },
            "de la más nueva a la más vieja, y la bajada no está")

        val primera = lista.first()
        assertEquals("El Bar", primera.barName)
        assertEquals("IPA", primera.beerName, "el nombre de la birra, no el slug")
        assertEquals("b", primera.authorName, "quién la subió es la mitad de la decisión")
        assertEquals(1, primera.votes)
        assertEquals(4, lista.last().ageDays, "y hace cuánto, la otra mitad")
    }

    // ---------- retirar la nota (BIR-11) ----------

    @Test
    fun `retirar el voto lo saca del promedio, y se puede volver a votar`() {
        val a = TestDb.insertUser("a")
        val b = TestDb.insertUser("b")
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 1, userId = a)

        ratings.upsert(NewRatingRequest(bar, "ipa", rating = 5.0), a)
        ratings.upsert(NewRatingRequest(bar, "ipa", rating = 1.0), b)
        assertEquals(2, ipa(bar).ratingCount)
        assertEquals(3.0, ipa(bar).ratingRaw)

        val quitado = ratings.retract(RetractRatingRequest(bar, "ipa"), a)
        assertTrue(quitado)
        assertEquals(1, ipa(bar).ratingCount, "el voto retirado deja de contar")
        assertEquals(1.0, ipa(bar).ratingRaw)
        assertTrue(ratings.mine(bar, a).isEmpty())
        // El de al lado no se toca.
        assertEquals(1.0, ratings.mine(bar, b).single().rating)

        // Y se puede volver: retirar borra la fila, así que el alta siguiente
        // no se topa con un voto viejo en estado `removed`.
        ratings.upsert(NewRatingRequest(bar, "ipa", rating = 4.0), a)
        assertEquals(4.0, ratings.mine(bar, a).single().rating)
        assertEquals(2, ipa(bar).ratingCount)
    }

    @Test
    fun `retirar sin haber votado no es un error`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        assertFalse(ratings.retract(RetractRatingRequest(bar, "ipa"), u))
    }

    @Test
    fun `se retira la nota de esa birra y no la de la de al lado`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)

        // Misma canilla, dos marcas: son dos birras distintas.
        ratings.upsert(NewRatingRequest(bar, "ipa", brandSlug = "antares", rating = 5.0), u)
        ratings.upsert(NewRatingRequest(bar, "ipa", rating = 2.0), u)

        ratings.retract(RetractRatingRequest(bar, "ipa", brandSlug = "antares"), u)

        val queda = ratings.mine(bar, u).single()
        assertNull(queda.brandSlug, "se fue la de Antares, queda la sin marca")
        assertEquals(2.0, queda.rating)
    }

    @Test
    fun `nadie puede retirar el voto de otro`() {
        val a = TestDb.insertUser("a")
        val b = TestDb.insertUser("b")
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        ratings.upsert(NewRatingRequest(bar, "ipa", rating = 5.0), a)

        assertFalse(ratings.retract(RetractRatingRequest(bar, "ipa"), b))
        assertEquals(5.0, ratings.mine(bar, a).single().rating)
    }

    private fun ipa(barId: Long) =
        bars.detail(barId, null, null)!!.prices.single { it.styleSlug == "ipa" }
}
