/* SPDX-License-Identifier: GPL-2.0-or-later */
#pragma once
#include <meta/meta-external-constraint.h>

/**
 * luna_tiling_constrain:
 * @info: the live Mutter constraint supplied to the constraint callback
 * @x: target frame x in logical pixels
 * @y: target frame y in logical pixels
 * @width: target frame width
 * @height: target frame height
 *
 * Write the pointed-to rectangle in place. Reading info.new_rect from GJS
 * produces a boxed copy; this function deliberately does not copy that pointer.
 * Only call synchronously inside Meta.ExternalConstraint.constrain.
 */
void luna_tiling_constrain (MetaExternalConstraintInfo *info,
                           int x, int y, int width, int height);
