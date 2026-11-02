package com.chastech.env.engine

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeWorldLabFieldLayerTest {
    private fun field(
        kind:String="scalar",renderer:String="slice",scope:String="public",
        roles:List<String> = emptyList(),values:List<Any?> = listOf(0,1,2,3,4,5,6,7,10,11,12,13,14,15,16,17),
        mask:List<Boolean>?=null,interpolation:String="none",validated:Boolean=false
    ):ByteArray {
        val dimensions=JSONArray(listOf(2,2,2))
        val components=when(kind){"scalar"->1;"vector"->3;"tensor"->9;else->throw IllegalArgumentException()}
        val data=if(values.size==18&&components!=1){
            // Caller may supply a compact per-cell component sequence; repeat it for two times.
            values
        }else values
        val root=JSONObject()
            .put("schemaVersion",1).put("id","field-1").put("label","Test field").put("kind",kind)
            .put("units",JSONObject().put("si","kelvin").put("display","K").put("scaleToSI",1).put("offsetToSI",0))
            .put("spatialReference",JSONObject().put("frame","LOCAL_ENU").put("crs","LOCAL_ENU")
                .put("originMeters",JSONArray(listOf(0,0,0))).put("axisOrder",JSONArray(listOf("x","y","z"))))
            .put("timeReference",JSONObject().put("kind","simulation").put("worldDateUTC","2026-11-01T00:00:00Z")
                .put("sampleTimesSeconds",JSONArray(listOf(0,1))).put("acquiredAtUTC",JSONObject.NULL)
                .put("validFromUTC",JSONObject.NULL).put("validToUTC",JSONObject.NULL).put("timezoneDisplay","UTC"))
            .put("source",JSONObject().put("kind","dataset").put("provider","test-provider").put("datasetId","test-1")
                .put("datasetVersion","1").put("license","CC0").put("retrievedAtUTC","2026-11-01T00:00:00Z")
                .put("sourceUri",JSONObject.NULL).put("evidence","measured-observed"))
            .put("calibration",JSONObject().put("status","not-applicable").put("method","No calibration required").put("reference",JSONObject.NULL))
            .put("resolution",JSONObject().put("dimensions",dimensions).put("spacingMeters",JSONArray(listOf(1,1,1))).put("sampleCount",8))
            .put("interpolation",JSONObject().put("method",interpolation).put("validated",validated).put("notes","Test fixture"))
            .put("mask",mask?.let{JSONArray(it)}?:JSONObject.NULL)
            .put("values",JSONArray(data))
            .put("events",JSONArray()).put("network",JSONObject.NULL)
            .put("range",JSONObject().put("minimumSI",-100000).put("maximumSI",100000).put("scale","linear")
                .put("uncertaintyLowerSI",JSONObject.NULL).put("uncertaintyUpperSI",JSONObject.NULL).put("uncertaintyStatement","not provided"))
            .put("permissions",JSONObject().put("scope",scope).put("readRoles",JSONArray(roles)).put("exportAllowed",false))
            .put("renderer",JSONObject().put("kind",renderer).put("implementationId","native-test-v1"))
            .put("legend",JSONObject().put("title","Test field").put("minimumLabel","Low").put("maximumLabel","High")
                .put("palette","viridis").put("accessibleDescription","Test field values"))
            .put("validity","Synthetic unit-test values only")
        return root.toString().toByteArray(Charsets.UTF_8)
    }

    @Test fun scalarSlicesReturnExactRecordedGridCellsAndNearestTime(){
        val layer=NativeWorldLabFieldLayerCodec.decode(field())
        val frame=layer.scalarSlice(0.9,NativeWorldLabFieldPlane.XY,1)
        assertEquals(1,frame.sampleIndex)
        assertEquals(1.0,frame.sampleTimeSeconds,0.0)
        assertEquals(listOf(14.0,15.0,16.0,17.0),frame.cells.map{it.components[0]})
        assertEquals(2,frame.dimensionU)
        assertEquals(2,frame.dimensionV)
    }

    @Test fun scalarSlicesRespectXZAndYZCoordinateOrdering(){
        val layer=NativeWorldLabFieldLayerCodec.decode(field())
        val xz=layer.scalarSlice(0.0,NativeWorldLabFieldPlane.XZ,1)
        val yz=layer.scalarSlice(0.0,NativeWorldLabFieldPlane.YZ,1)
        assertEquals(listOf(2.0,3.0,6.0,7.0),xz.cells.map{it.components[0]})
        assertEquals(listOf(1.0,3.0,5.0,7.0),yz.cells.map{it.components[0]})
    }

    @Test fun scalarNodataRemainsNullAndInvalidSliceIsRejected(){
        val raw=listOf<Any?>(JSONObject.NULL,1,2,3,4,5,6,7,10,11,12,13,14,15,16,17)
        val mask=listOf(false)+List(15){true}
        val layer=NativeWorldLabFieldLayerCodec.decode(field(values=raw,mask=mask))
        assertNull(layer.scalarSlice(0.0,NativeWorldLabFieldPlane.XY,0).cells.first().components[0])
        assertThrows(IllegalArgumentException::class.java){layer.scalarSlice(0.0,NativeWorldLabFieldPlane.XY,2)}
    }

    @Test fun vectorGlyphGridAndTensorComponentSlicesUseRecordedComponents(){
        val vectorValues=(0 until 48).map{it.toDouble()}
        val vector=NativeWorldLabFieldLayerCodec.decode(field(
            kind="vector",renderer="glyphs",values=vectorValues
        ))
        val glyphs=vector.vectorGlyphs(0.0,NativeWorldLabFieldPlane.XY,0)
        assertEquals(listOf(0.0,1.0,2.0),glyphs.cells.first().components)
        assertEquals(listOf(9.0,10.0,11.0),glyphs.cells.last().components)

        val tensorValues=(0 until 144).map{it.toDouble()}
        val tensor=NativeWorldLabFieldLayerCodec.decode(field(
            kind="tensor",renderer="slice",values=tensorValues
        ))
        val slice=tensor.tensorSlice(1.0,8,NativeWorldLabFieldPlane.XY,1)
        assertEquals(listOf(135.0,136.0,137.0,138.0,139.0,140.0,141.0,142.0,143.0),
            slice.cells.last().components)
        assertThrows(IllegalArgumentException::class.java){tensor.tensorSlice(0.0,9)}
    }

    @Test fun streamlinesRequireValidatedInterpolationAndFollowRecordedVectorSamples(){
        val values=(0 until 48).map{index->
            when(index%3){0->1.0;1->0.0;else->0.0}
        }
        val invalid=NativeWorldLabFieldLayerCodec.decode(field(
            kind="vector",renderer="streamlines",values=values,interpolation="nearest"
        ))
        assertThrows(IllegalArgumentException::class.java){invalid.vectorStreamlines(0.0)}
        val layer=NativeWorldLabFieldLayerCodec.decode(field(
            kind="vector",renderer="streamlines",values=values,interpolation="linear",validated=true
        ))
        val frame=layer.vectorStreamlines(0.0)
        assertTrue(frame.paths.isNotEmpty())
        assertTrue(frame.paths.all{path->path.size>=2&&path.all{it.u in 0.0..1.0&&it.v in 0.0..1.0}})
    }

    @Test fun privateAndSharedDatasetPermissionsFailClosed(){
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabFieldLayerCodec.decode(field(scope="private",roles=listOf("owner")))
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabFieldLayerCodec.decode(field(scope="shared",roles=listOf("researcher")))
        }
        val shared=NativeWorldLabFieldLayerCodec.decode(
            field(scope="shared",roles=listOf("researcher")),setOf("researcher"))
        assertEquals("shared",shared.permissionsScope)
        val privateLayer=NativeWorldLabFieldLayerCodec.decode(
            field(scope="private",roles=listOf("owner")),setOf("owner"))
        assertEquals("private",privateLayer.permissionsScope)
    }

    @Test fun strictBoundsRejectInvalidTimeAxesAndUnimplementedRenderers(){
        val invalidTime=JSONObject(String(field())).apply{
            getJSONObject("timeReference").put("sampleTimesSeconds",JSONArray(listOf(0,0)))
        }.toString().toByteArray(Charsets.UTF_8)
        assertThrows(IllegalArgumentException::class.java){NativeWorldLabFieldLayerCodec.decode(invalidTime)}
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabFieldLayerCodec.decode(field(renderer="volume"))
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabFieldLayerCodec.decode(ByteArray(NativeWorldLabFieldLayerCodec.MAX_BYTES+1))
        }
    }
}
