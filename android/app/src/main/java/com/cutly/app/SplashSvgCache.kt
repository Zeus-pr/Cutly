package com.cutly.app

import android.content.res.AssetManager
import android.graphics.drawable.PictureDrawable
import com.caverock.androidsvg.SVG

object SplashSvgCache {
  private val cache = mutableMapOf<String, PictureDrawable?>()

  fun drawable(assets: AssetManager, file: String): PictureDrawable? {
    cache[file]?.let { return it }
    val loaded = try {
      val svg = SVG.getFromAsset(assets, "splash-field/$file")
      PictureDrawable(svg.renderToPicture())
    } catch (_: Exception) {
      null
    }
    cache[file] = loaded
    return loaded
  }
}
