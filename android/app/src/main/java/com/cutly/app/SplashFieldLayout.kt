package com.cutly.app

import android.content.res.AssetManager
import org.json.JSONObject

data class SplashCell(val l: Int, val t: Int, val file: String)

object SplashFieldLayout {
  private const val DESIGN_WIDTH = 720
  private const val FIELD_HEIGHT = 2380
  /** Match JS OpeningSplash — cells visible during 980px scroll. */
  private const val MAX_CELL_TOP = 980 + 1280

  fun load(assets: AssetManager): List<SplashCell> {
    val json = assets.open("splash_field_layout.json").bufferedReader().use { it.readText() }
    val root = JSONObject(json)
    val cells = root.getJSONArray("cells")
    val out = ArrayList<SplashCell>(cells.length())
    for (i in 0 until cells.length()) {
      val cell = cells.getJSONObject(i)
      val t = cell.getInt("t")
      if (t >= MAX_CELL_TOP) continue
      out.add(
        SplashCell(
          l = cell.getInt("l"),
          t = t,
          file = cell.getString("f")
        )
      )
    }
    return out
  }

  fun designWidth(): Int = DESIGN_WIDTH

  fun fieldHeight(): Int = FIELD_HEIGHT
}
