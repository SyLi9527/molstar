/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { Unit, Structure } from 'mol-model/structure';
import { UnitsVisual } from '../representation';
import { PolymerTraceIterator, createCurveSegmentState, interpolateCurveSegment, PolymerLocationIterator, getPolymerElementLoci, markPolymerElement } from './util/polymer';
import { Vec3, Mat4 } from 'mol-math/linear-algebra';
import { SecondaryStructureType, isNucleic } from 'mol-model/structure/model/types';
import { UnitsMeshVisual, UnitsMeshParams } from '../units-visual';
import { ParamDefinition as PD } from 'mol-util/param-definition';
import { Wedge } from 'mol-geo/primitive/wedge';
import { Mesh } from 'mol-geo/geometry/mesh/mesh';
import { MeshBuilder } from 'mol-geo/geometry/mesh/mesh-builder';
import { VisualContext } from 'mol-repr/representation';
import { Theme } from 'mol-theme/theme';

const t = Mat4.identity()
const sVec = Vec3.zero()
const n0 = Vec3.zero()
const n1 = Vec3.zero()
const upVec = Vec3.zero()

const depthFactor = 4
const widthFactor = 4
const heightFactor = 6

const wedge = Wedge()

export const PolymerDirectionWedgeParams = {
    sizeFactor: PD.Numeric('Size Factor', '', 0.2, 0, 10, 0.01),
}
export const DefaultPolymerDirectionWedgeProps = PD.getDefaultValues(PolymerDirectionWedgeParams)
export type PolymerDirectionWedgeProps = typeof DefaultPolymerDirectionWedgeProps

async function createPolymerDirectionWedgeMesh(ctx: VisualContext, unit: Unit, structure: Structure, theme: Theme, props: PolymerDirectionWedgeProps, mesh?: Mesh) {
    const polymerElementCount = unit.polymerElements.length

    if (!polymerElementCount) return Mesh.createEmpty(mesh)
    const { sizeFactor } = props

    const vertexCount = polymerElementCount * 24
    const builder = MeshBuilder.create(vertexCount, vertexCount / 10, mesh)
    const linearSegments = 1

    const state = createCurveSegmentState(linearSegments)
    const { normalVectors, binormalVectors } = state

    let i = 0
    const polymerTraceIt = PolymerTraceIterator(unit)
    while (polymerTraceIt.hasNext) {
        const v = polymerTraceIt.move()
        builder.setGroup(i)

        const isNucleicType = isNucleic(v.moleculeType)
        const isSheet = SecondaryStructureType.is(v.secStrucType, SecondaryStructureType.Flag.Beta)
        const tension = (isNucleicType || isSheet) ? 0.5 : 0.9
        const shift = isNucleicType ? 0.3 : 0.5

        interpolateCurveSegment(state, v, tension, shift)

        if ((isSheet && !v.secStrucChange) || !isSheet) {
            const size = theme.size.size(v.center) * sizeFactor
            const depth = depthFactor * size
            const width = widthFactor * size
            const height = heightFactor * size

            const vectors = isNucleicType ? binormalVectors : normalVectors
            Vec3.fromArray(n0, vectors, 0)
            Vec3.fromArray(n1, vectors, 3)
            Vec3.normalize(upVec, Vec3.add(upVec, n0, n1))

            Mat4.targetTo(t, v.p3, v.p1, upVec)
            Mat4.mul(t, t, Mat4.rotY90Z180)
            Mat4.scale(t, t, Vec3.set(sVec, height, width, depth))
            Mat4.setTranslation(t, v.p2)
            builder.add(t, wedge)
        }

        if (i % 10000 === 0 && ctx.runtime.shouldUpdate) {
            await ctx.runtime.update({ message: 'Polymer direction mesh', current: i, max: polymerElementCount });
        }
        ++i
    }

    return builder.getMesh()
}

export const PolymerDirectionParams = {
    ...UnitsMeshParams,
    ...PolymerDirectionWedgeParams
}
export const DefaultPolymerDirectionProps = PD.getDefaultValues(PolymerDirectionParams)
export type PolymerDirectionProps = typeof DefaultPolymerDirectionProps

export function PolymerDirectionVisual(): UnitsVisual<PolymerDirectionProps> {
    return UnitsMeshVisual<PolymerDirectionProps>({
        defaultProps: DefaultPolymerDirectionProps,
        createGeometry: createPolymerDirectionWedgeMesh,
        createLocationIterator: PolymerLocationIterator.fromGroup,
        getLoci: getPolymerElementLoci,
        mark: markPolymerElement,
        setUpdateState: () => {}
    })
}