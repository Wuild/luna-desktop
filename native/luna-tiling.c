/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "luna-tiling.h"

void
luna_tiling_constrain (MetaExternalConstraintInfo *info,
                      int x, int y, int width, int height)
{
    g_return_if_fail (info != NULL && info->new_rect != NULL);
    g_return_if_fail (width > 0 && height > 0);
    *info->new_rect = (MtkRectangle) {x, y, width, height};
}
