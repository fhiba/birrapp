package com.birrapp

import com.birrapp.core.Db
import java.sql.Connection

/**
 * Tests contra un PostGIS real (contenedor `db_test`, puerto 5434), no H2.
 *
 * H2 no tiene PostGIS, ni `DISTINCT ON`, ni tipos ENUM, ni
 * `percentile_cont`. O sea: justo todo lo que hay que testear. Un test que
 * pasa en H2 y falla en producción es peor que no tener test.
 */
object TestDb {
    val db: Db by lazy {
        val d = Db.connect(
            System.getenv("TEST_DATABASE_URL") ?: "jdbc:postgresql://localhost:5434/birrapp_test",
            System.getenv("TEST_DATABASE_USER") ?: "birrapp",
            System.getenv("TEST_DATABASE_PASSWORD") ?: "birrapp_test",
        )
        d.migrate()
        d
    }

    /**
     * Limpia todo menos los vocabularios (estilos y marcas).
     *
     * `brands` referencia a `users`, así que el TRUNCATE CASCADE de usuarios
     * se la lleva puesta aunque no esté en la lista. Por eso se vuelve a
     * sembrar acá: si no, los tests que usan marcas fallan con "marca
     * desconocida" y el motivo no es evidente.
     */
    fun reset() {
        db.conn { c ->
            c.createStatement().use {
                it.execute(
                    "TRUNCATE flags, reviews, price_reports, refresh_tokens, bars, users " +
                        "RESTART IDENTITY CASCADE"
                )
            }
            c.createStatement().use {
                it.execute(
                    """
                    INSERT INTO brands (slug, name, craft) VALUES
                        ('antares','Antares',true),
                        ('berlina','Berlina',true),
                        ('juguetes-perdidos','Juguetes Perdidos',true),
                        ('quilmes','Quilmes',false)
                    ON CONFLICT (slug) DO NOTHING
                    """.trimIndent()
                )
            }
        }
    }

    /**
     * Limpia sólo el tráfico.
     *
     * Va aparte de `reset()` porque `traffic_sessions` no referencia a nadie:
     * no la arrastra el TRUNCATE CASCADE de usuarios, y los tests de tráfico
     * no necesitan resembrar vocabularios.
     */
    fun resetTraffic() {
        db.conn { c -> c.createStatement().use { it.execute("TRUNCATE traffic_sessions") } }
    }

    fun styleId(c: Connection, slug: String): Long =
        c.prepareStatement("SELECT id FROM beer_styles WHERE slug = ?").use { st ->
            st.setString(1, slug)
            st.executeQuery().use { rs -> rs.next(); rs.getLong(1) }
        }

    fun insertUser(name: String = "test", role: String = "user"): Long = db.conn { c ->
        c.prepareStatement(
            "INSERT INTO users (google_sub, email, display_name, role) " +
                "VALUES (?, ?, ?, ?::user_role) RETURNING id"
        ).use { st ->
            st.setString(1, "sub-$name-${System.nanoTime()}")
            st.setString(2, "$name@test.local")
            st.setString(3, name)
            st.setString(4, role)
            st.executeQuery().use { rs -> rs.next(); rs.getLong(1) }
        }
    }

    fun insertBar(
        name: String, lat: Double, lng: Double, status: String = "approved", createdBy: Long? = null
    ): Long =
        db.conn { c ->
            c.prepareStatement(
                "INSERT INTO bars (name, location, status, created_by) " +
                    "VALUES (?, ST_MakePoint(?, ?)::geography, ?::moderation_status, ?) RETURNING id"
            ).use { st ->
                st.setString(1, name); st.setDouble(2, lng); st.setDouble(3, lat)
                st.setString(4, status)
                if (createdBy != null) st.setLong(5, createdBy) else st.setNull(5, java.sql.Types.BIGINT)
                st.executeQuery().use { rs -> rs.next(); rs.getLong(1) }
            }
        }

    /** Inserta un precio con fecha retroactiva, para poder probar la frescura. */
    fun insertPrice(
        barId: Long, styleSlug: String, price: Double, daysAgo: Int,
        userId: Long, sizeMl: Int = 473, isConfirmation: Boolean = false,
    ): Long = db.conn { c ->
        val sid = styleId(c, styleSlug)
        c.prepareStatement(
            "INSERT INTO price_reports " +
                "(bar_id, style_id, price, size_ml, reported_by, created_at, is_confirmation) " +
                "VALUES (?, ?, ?, ?, ?, now() - make_interval(days => ?), ?) RETURNING id"
        ).use { st ->
            st.setLong(1, barId); st.setLong(2, sid); st.setDouble(3, price)
            st.setInt(4, sizeMl); st.setLong(5, userId); st.setInt(6, daysAgo)
            st.setBoolean(7, isConfirmation)
            st.executeQuery().use { rs -> rs.next(); rs.getLong(1) }
        }
    }

    /** Inserta una foto de bar. */
    fun insertPhoto(barId: Long, styleSlug: String, userId: Long): Long = db.conn { c ->
        val sid = styleId(c, styleSlug)
        c.prepareStatement(
            "INSERT INTO bar_photos (bar_id, style_id, user_id, object_key) " +
                "VALUES (?, ?, ?, ?) RETURNING id"
        ).use { st ->
            st.setLong(1, barId); st.setLong(2, sid); st.setLong(3, userId)
            st.setString(4, "test-photo-${System.nanoTime()}.jpg")
            st.executeQuery().use { rs -> rs.next(); rs.getLong(1) }
        }
    }
}
