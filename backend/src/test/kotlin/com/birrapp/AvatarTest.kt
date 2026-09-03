package com.birrapp

import com.birrapp.auth.GoogleIdentity
import com.birrapp.auth.UserRepo
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Foto de perfil propia.
 *
 * Lo que se testea es que convivan las dos fotos. La de Google se refresca en
 * cada login; la propia tiene que sobrevivir a eso, y sacarla tiene que
 * devolver la de Google en lugar de dejar a la persona sin nada.
 */
class AvatarTest {
    private val repo by lazy { UserRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    private fun identity(picture: String?) = GoogleIdentity(
        sub = "sub-avatar", email = "avatar@test.local", emailVerified = true,
        name = "Avatar", picture = picture,
    )

    @Test
    fun `volver a loguear no pisa la foto propia`() {
        val u = repo.upsert(identity("https://google/foto1.jpg"), emptySet())
        assertEquals("https://google/foto1.jpg", u.avatarUrl)

        repo.setAvatar(u.id, "avatar/${u.id}/mia.webp", "https://bucket/avatar/mia.webp")

        // Google cambió la suya y la persona volvió a entrar. Sin el CASE del
        // upsert, este login le deshacía la foto que había subido.
        repo.upsert(identity("https://google/foto2.jpg"), emptySet())

        assertEquals("https://bucket/avatar/mia.webp", repo.findById(u.id)!!.avatarUrl)
    }

    @Test
    fun `sacar la propia devuelve la de Google, no deja sin foto`() {
        val u = repo.upsert(identity("https://google/foto1.jpg"), emptySet())
        repo.setAvatar(u.id, "avatar/${u.id}/mia.webp", "https://bucket/avatar/mia.webp")

        // Se entra de nuevo: la de Google se actualiza por detrás aunque no se
        // esté mostrando, así que al sacar la propia vuelve la más reciente.
        repo.upsert(identity("https://google/foto2.jpg"), emptySet())

        val previous = repo.clearAvatar(u.id)
        assertEquals("avatar/${u.id}/mia.webp", previous, "hay que borrar el objeto del bucket")
        assertEquals("https://google/foto2.jpg", repo.findById(u.id)!!.avatarUrl)
    }

    @Test
    fun `cambiar de foto devuelve la anterior para poder borrarla`() {
        val u = repo.upsert(identity(null), emptySet())

        assertNull(repo.setAvatar(u.id, "avatar/${u.id}/a.webp", "https://bucket/a.webp"))
        assertEquals(
            "avatar/${u.id}/a.webp",
            repo.setAvatar(u.id, "avatar/${u.id}/b.webp", "https://bucket/b.webp"),
            "sin esto cada cambio deja un archivo público huérfano en el bucket",
        )
        assertEquals("https://bucket/b.webp", repo.findById(u.id)!!.avatarUrl)
    }

    @Test
    fun `una cuenta sin foto de Google queda sin foto al sacar la propia`() {
        val u = repo.upsert(identity(null), emptySet())
        repo.setAvatar(u.id, "avatar/${u.id}/mia.webp", "https://bucket/mia.webp")

        repo.clearAvatar(u.id)
        assertNull(repo.findById(u.id)!!.avatarUrl, "no hay a qué volver, y eso es válido")
    }

    @Test
    fun `borrar la cuenta junta los objetos a borrar del bucket`() {
        val u = repo.upsert(identity(null), emptySet())
        repo.setAvatar(u.id, "avatar/${u.id}/mia.webp", "https://bucket/mia.webp")

        val deleted = repo.deleteAccount(u.id)!!
        assertTrue(
            "avatar/${u.id}/mia.webp" in deleted.objectKeys,
            "las fotos se sirven desde una URL pública: borrar la fila no alcanza",
        )
        assertNull(repo.findById(u.id))
    }
}
