import * as React from 'react';
import * as THREE from 'three';

import {
  ArrowBackIosNew,
  ArrowForwardIos,
  AllInclusiveOutlined,
  ChangeHistory,
  ContentPasteGo,
  Delete,
  ExpandMore,
  FirstPage,
  GestureOutlined,
  KeyboardArrowUp,
  KeyboardArrowDown,
  LinearScaleOutlined,
  LastPage,
  Pause,
  PlayArrow,
  RadioButtonUnchecked,
  Replay,
  Timeline,
  Visibility,
  Edit,
} from '@mui/icons-material';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  InputAdornment,
  Slider,
  Typography
} from '@mui/material';
import { MeshLine, MeshLineMaterial } from 'meshline';
import { useContext, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';
import AddAPhotoIcon from '@mui/icons-material/AddAPhoto';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import IconButton from '@mui/material/IconButton';
import { Stack } from '@mui/system';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { CameraHelper } from './CameraHelper';
import { get_curve_object_from_cameras, get_transform_matrix } from './curve';
import { WebSocketContext } from '../../WebSocket/WebSocket';

const msgpack = require('msgpack-lite');

const FOV_LABELS = {
  FOV: '°',
  MM: 'mm',
};

function set_camera_position(camera, matrix) {
  const mat = new THREE.Matrix4();
  mat.fromArray(matrix.elements);
  mat.decompose(camera.position, camera.quaternion, camera.scale);
}

function FovSelector(props) {
  const fovLabel = props.fovLabel;
  const setFovLabel = props.setFovLabel;
  const camera = props.camera;
  const dispatch = props.dispatch;
  const changeMain = props.changeMain;

  const getFovLabel = () => {
    const label = Math.round(
      fovLabel === FOV_LABELS.FOV
        ? camera.getEffectiveFOV()
        : camera.getFocalLength(),
    );
    return label;
  };

  const [ui_field_of_view, setUIFieldOfView] = React.useState(
    getFovLabel(camera.fov),
  );

  useEffect(() => setUIFieldOfView(getFovLabel()), [fovLabel]);

  const setFOV = (val) => {
    if (fovLabel === FOV_LABELS.FOV) {
      camera.fov = val;
    } else {
      camera.setFocalLength(val);
    }

    if (changeMain) {
      dispatch({
        type: 'write',
        path: 'renderingState/field_of_view',
        data: camera.getEffectiveFOV(),
      });
    }
  };

  const toggleFovLabel = () => {
    if (fovLabel === FOV_LABELS.FOV) {
      setFovLabel(FOV_LABELS.MM);
    } else {
      setFovLabel(FOV_LABELS.FOV);
    }
  };

  return (
    <TextField
      label={fovLabel === FOV_LABELS.FOV ? 'FOV' : 'Focal Length'}
      inputProps={{
        inputMode: 'numeric',
        pattern: '[+-]?([0-9]*[.])?[0-9]+',
      }}
      // eslint-disable-next-line
      InputProps={{
        endAdornment: (
          <Tooltip title="Switch between FOV and Focal Length">
            <InputAdornment
              sx={{ cursor: 'pointer' }}
              onClick={toggleFovLabel}
              position="end"
            >
              {fovLabel === FOV_LABELS.FOV ? '°' : 'mm'}
            </InputAdornment>
          </Tooltip>
        ),
      }}
      onChange={(e) => {
        if (e.target.validity.valid) {
          setUIFieldOfView(e.target.value);
        }
      }}
      onBlur={(e) => {
        if (e.target.validity.valid) {
          if (e.target.value !== '') {
            setFOV(parseInt(e.target.value, 10));
          } else {
            setUIFieldOfView(getFovLabel());
          }
        }
      }}
      value={ui_field_of_view}
      error={camera.fov <= 0}
      helperText={camera.fov <= 0 ? 'Required' : ''}
      variant="standard"
    />
  );
}

function CameraKeyframeSlider(props) {
  const cameras = props.cameras;
  const cameraProperties = props.cameraProperties;
  const setCameraProperties = props.setCameraProperties;
  // onChange={handleChange}

  return (
    <Slider
      getAriaLabel={() => 'Temperature range'}
      value={
        cameras.map((camera, index) => {
          camera.properties.time
        })
      }
      getAriaValueText={'DOG'}
      track={false}
    />
  )
}

function CameraList(props) {
  const sceneTree = props.sceneTree;
  const cameras = props.cameras;
  const camera_main = props.camera_main;
  const transform_controls = props.transform_controls;
  const setCameras = props.setCameras;
  const swapCameras = props.swapCameras;
  const fovLabel = props.fovLabel;
  const setFovLabel = props.setFovLabel;
  const cameraProperties = props.cameraProperties;
  const setCameraProperties = props.setCameraProperties;
  const dispatch = props.dispatch;
  
  // eslint-disable-next-line no-unused-vars
  const [slider_value, set_slider_value] = React.useState(0);
  const [expanded, setExpanded] = React.useState(null);

  const handleChange =
    (cameraUUID: string) =>
    (event: React.SyntheticEvent, isExpanded: boolean) => {
      setExpanded(isExpanded ? cameraUUID : false);
    };

  const set_transform_controls = (index) => {
    // camera helper object so grab the camera inside
    const camera = sceneTree.find_object_no_create([
      'Camera Path',
      'Cameras',
      index.toString(),
      'Camera',
    ]);
    if (camera !== null) {
      const viewer_buttons = document.getElementsByClassName(
        'ViewerWindow-buttons',
      )[0];
      if (camera === transform_controls.object) {
        // double click to remove controls from object
        transform_controls.detach();
        viewer_buttons.style.display = 'none';
      } else {
        transform_controls.detach();
        transform_controls.attach(camera);
        viewer_buttons.style.display = 'block';
      }
    }
  };

  const reset_slider_render_on_change = () => {
    // set slider and render camera back to 0
    const slider_min = 0;
    const camera_render = sceneTree.find_object_no_create([
      'Cameras',
      'Render Camera',
    ]);
    const camera_render_helper = sceneTree.find_object_no_create([
      'Cameras',
      'Render Camera',
      'Helper',
    ]);
    if (cameras.length >= 1) {
      let first_camera = sceneTree.find_object_no_create([
        'Camera Path',
        'Cameras',
        0,
        'Camera',
      ]);
      if (first_camera.type !== 'PerspectiveCamera' && cameras.length > 1) {
        first_camera = sceneTree.find_object_no_create([
          'Camera Path',
          'Cameras',
          1,
          'Camera',
        ]);
      }
      set_camera_position(camera_render, first_camera.matrix);
      camera_render_helper.set_visibility(true);
      camera_render.fov = first_camera.fov;
    }
    set_slider_value(slider_min);
  };

  const delete_camera = (index) => {
    const camera_render_helper = sceneTree.find_object_no_create([
      'Cameras',
      'Render Camera',
      'Helper',
    ]);
    console.log('TODO: deleting camera: ', index);
    sceneTree.delete(['Camera Path', 'Cameras', index.toString(), 'Camera']);
    sceneTree.delete([
      'Camera Path',
      'Cameras',
      index.toString(),
      'Camera Helper',
    ]);

    setCameras([...cameras.slice(0, index), ...cameras.slice(index + 1)]);
    // detach and hide transform controls
    transform_controls.detach();
    const viewer_buttons = document.getElementsByClassName(
      'ViewerWindow-buttons',
    )[0];
    viewer_buttons.style.display = 'none';
    if (cameras.length < 1) {
      camera_render_helper.set_visibility(false);
    }
    reset_slider_render_on_change();
  };

  // TODO: Add pencil for editing?
  const cameraList = cameras.map((camera, index) => {
    return (
      <Accordion
        className="CameraList-row"
        key={camera.uuid}
        expanded={expanded === camera.uuid}
        onChange={handleChange(camera.uuid)}
      >
        <AccordionSummary
          expandIcon={<ExpandMore sx={{ color: '#eeeeee' }} />}
          aria-controls="panel1bh-content"
          id="panel1bh-header"
        >
          <Stack spacing={0}>
            <Button
              size="small"
              onClick={(e) => {
                swapCameras(index, index - 1);
                e.stopPropagation();
              }}
              style={{
                maxWidth: '30px',
                maxHeight: '30px',
                minWidth: '30px',
                minHeight: '30px',
              }}
              disabled={index === 0}
            >
              <KeyboardArrowUp />
            </Button>
            <Button
              size="small"
              onClick={(e) => {
                swapCameras(index, index + 1);
                e.stopPropagation();
              }}
              style={{
                maxWidth: '30px',
                maxHeight: '30px',
                minWidth: '30px',
                minHeight: '30px',
              }}
              disabled={index === cameras.length - 1}
            >
              <KeyboardArrowDown />
            </Button>
          </Stack>
          <Button size="small">
            <TextField
              id="standard-basic"
              value={camera.properties.get('NAME')}
              variant="standard"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                const cameraProps = new Map(cameraProperties);
                cameraProps.get(camera.uuid).set('NAME', e.target.value);
                setCameraProperties(cameraProps);
              }}
              sx={{
                alignItems: 'center',
                alignContent: 'center',
              }}
            />
          </Button>
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              set_transform_controls(index);
            }}
          >
            <Edit />
          </Button>
          <Stack spacing={0} direction="row" justifyContent="end">
            <Button
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                set_camera_position(camera_main, camera.matrix);
                camera_main.fov = camera.fov;
              }}
            >
              <Visibility />
            </Button>
            <Button size="small" onClick={() => delete_camera(index)}>
              <Delete />
            </Button>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <FovSelector
            fovLabel={fovLabel}
            setFovLabel={setFovLabel}
            camera={camera}
            dispatch={dispatch}
            changeMain
          />
        </AccordionDetails>
      </Accordion>
    );
  });
  return <div>{cameraList}</div>;
}

export default function CameraPanel(props) {
  // unpack relevant information
  const sceneTree = props.sceneTree;
  const camera_main = sceneTree.find_object_no_create([
    'Cameras',
    'Main Camera',
  ]);
  const camera_render = sceneTree.find_object_no_create([
    'Cameras',
    'Render Camera',
  ]);
  const camera_render_helper = sceneTree.find_object_no_create([
    'Cameras',
    'Render Camera',
    'Helper',
  ]);
  const transform_controls = sceneTree.find_object_no_create([
    'Transform Controls',
  ]);

  // redux store state
  const config_base_dir = useSelector(
    (state) => state.renderingState.config_base_dir,
  );
  const websocket = useContext(WebSocketContext).socket;

  // react state
  const [cameras, setCameras] = React.useState([]);
  // Mapping of camera id to each camera's properties
  const [cameraProperties, setCameraProperties] = React.useState(new Map());
  const [slider_value, set_slider_value] = React.useState(0);
  const [smoothness_value, set_smoothness_value] = React.useState(0.5);
  const [is_playing, setIsPlaying] = React.useState(false);
  const [is_cycle, setIsCycle] = React.useState(false);
  const [is_linear, setIsLinear] = React.useState(false);
  const [seconds, setSeconds] = React.useState(4);
  const [fps, setFps] = React.useState(24);

  const dispatch = useDispatch();
  const render_height = useSelector(
    (state) => state.renderingState.render_height,
  );
  const render_width = useSelector(
    (state) => state.renderingState.render_width,
  );

  const swapCameras = (index, new_index) => {
    if (
      Math.min(index, new_index) < 0 ||
      Math.max(index, new_index) >= cameras.length
    )
      return;
      
      const swapCameraTime = cameras[index].properties.get('TIME');
      setCameraProperty('TIME', cameras[new_index].properties.get('TIME'), index);
      setCameraProperty('TIME', swapCameraTime, new_index);
    
    const new_cameras = [
      ...cameras.slice(0, index),
      ...cameras.slice(index + 1),
    ];
    setCameras([
      ...new_cameras.slice(0, new_index),
      cameras[index],
      ...new_cameras.slice(new_index),
    ]);

    // reset_slider_render_on_change();
  };

  const setRenderHeight = (value) => {
    dispatch({
      type: 'write',
      path: 'renderingState/render_height',
      data: value,
    });
  };
  const setRenderWidth = (value) => {
    dispatch({
      type: 'write',
      path: 'renderingState/render_width',
      data: value,
    });
  };

  // ui state
  const [ui_render_height, setUIRenderHeight] = React.useState(render_height);
  const [ui_render_width, setUIRenderWidth] = React.useState(render_width);
  const [ui_seconds, setUISeconds] = React.useState(seconds);
  const [ui_fps, setUIfps] = React.useState(fps);
  const [fovLabel, setFovLabel] = React.useState(FOV_LABELS.FOV);

  // nonlinear render option
  const slider_min = 0;
  const slider_max = 1;

  // animation constants
  const total_num_steps = seconds * fps;
  const step_size = slider_max / total_num_steps;

  const reset_slider_render_on_add = (new_camera_list) => {
    // set slider and render camera back to 0
    if (new_camera_list.length >= 1) {
      set_camera_position(camera_render, new_camera_list[0].matrix);
      camera_render.fov = new_camera_list[0].fov;
      set_slider_value(slider_min);
    }
  };

  const add_camera = () => {
    const camera_main_copy = camera_main.clone();
    camera_main_copy.aspect = 1.0;
    const new_camera_properties = new Map();
    camera_main_copy.properties = new_camera_properties;
    new_camera_properties.set('FOV', camera_main.fov);
    new_camera_properties.set('NAME', `Camera ${cameras.length}`);
    // TIME VALUES ARE 0-1
    new_camera_properties.set('TIME', 1.0);

    const ratio = cameras.length / (cameras.length + 1);

    const new_properties = new Map(cameraProperties);
    new_properties.forEach((properties, id) => {
      properties.set('TIME', properties.get('TIME') * ratio);
    });

    new_properties.set(camera_main_copy.uuid, new_camera_properties),

    setCameraProperties(
      new_properties,
    );

    console.log("CAMERA TIMES:");
    cameraProperties.forEach((properties, id) => {
      console.log(`Camera \"${properties.get('NAME')}\"; TIME: ${properties.get('TIME')}`);
    });

    const new_camera_list = cameras.concat(camera_main_copy);
    setCameras(new_camera_list);
    reset_slider_render_on_add(new_camera_list);
  };

  // force a rerender if the cameras are dragged around
  let update_cameras_interval = null;
  // eslint-disable-next-line no-unused-vars
  transform_controls.addEventListener('mouseDown', (event) => {
    // prevent multiple loops
    if (update_cameras_interval === null) {
      // hardcoded for 100 ms per udpate
      update_cameras_interval = setInterval(() => {}, 100);
    }
  });
  // eslint-disable-next-line no-unused-vars
  transform_controls.addEventListener('mouseUp', (event) => {
    if (update_cameras_interval !== null) {
      clearInterval(update_cameras_interval);
      update_cameras_interval = null;
      setCameras(cameras);
    }
  });

  // draw cameras and curve to the scene
  useEffect(() => {
    // draw the cameras

    const labels = Array.from(document.getElementsByClassName('label'));
    labels.forEach((label) => {
      label.remove();
    });

    sceneTree.delete(['Camera Path', 'Cameras']); // delete old cameras, which is important
    if (cameras.length < 1) {
      camera_render_helper.set_visibility(false);
    } else {
      camera_render_helper.set_visibility(true);
    }
    for (let i = 0; i < cameras.length; i += 1) {
      const camera = cameras[i];
      // camera.aspect = render_width / render_height;
      const camera_helper = new CameraHelper(camera, 0x393e46);

      const labelDiv = document.createElement('div');
      labelDiv.className = 'label';
      labelDiv.textContent = i;
      labelDiv.style.color = 'black';
      labelDiv.style.visibility = 'visible';
      const camera_label = new CSS2DObject(labelDiv);
      camera_label.position.set(0, -0.1, -0.1);
      camera_helper.add(camera_label);
      camera_label.layers.set(0);

      // camera
      sceneTree.set_object_from_path(
        ['Camera Path', 'Cameras', i.toString(), 'Camera'],
        camera,
      );
      // camera helper
      sceneTree.set_object_from_path(
        ['Camera Path', 'Cameras', i.toString(), 'Camera Helper'],
        camera_helper,
      );
    }
  }, [cameras, render_width, render_height]);

  // update the camera curve
  const curve_object = get_curve_object_from_cameras(
    cameras,
    is_cycle,
    smoothness_value,
  );

  if (cameras.length > 1) {
    const num_points = fps * seconds;
    const points = curve_object.curve_positions.getPoints(num_points);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const spline = new MeshLine();
    spline.setGeometry(geometry);
    const material = new MeshLineMaterial({ lineWidth: 0.01, color: 0xff5024 });
    const spline_mesh = new THREE.Mesh(spline.geometry, material);
    sceneTree.set_object_from_path(['Camera Path', 'Curve'], spline_mesh);

    // set the camera
    const point = Math.min(slider_value / (cameras.length - 1.0), 1);
    let position = null;
    let lookat = null;
    let up = null;
    let fov = null;
    if (!is_linear) {
      position = curve_object.curve_positions.getPoint(point);
      lookat = curve_object.curve_lookats.getPoint(point);
      up = curve_object.curve_ups.getPoint(point);
      fov = curve_object.curve_fovs.getPoint(point).z;
    } else {
      position = curve_object.curve_positions.getPointAt(point);
      lookat = curve_object.curve_lookats.getPointAt(point);
      up = curve_object.curve_ups.getPointAt(point);
      fov = curve_object.curve_fovs.getPointAt(point).z;
    }
    const mat = get_transform_matrix(position, lookat, up);
    set_camera_position(camera_render, mat);
    camera_render.fov = fov;
  } else {
    sceneTree.delete(['Camera Path', 'Curve']);
  }

  const marks = [];
  for (let i = 0; i <= 1; i += 0.25) {
    marks.push({ value: i, label: `${(seconds * i).toFixed(1).toString()}s` });
  }

  const values = [];
  cameras.forEach((camera, index) => {
    values.push((camera.properties.get('TIME')));
  });

  const setCameraProperty = (
    property,
    value,
    index
  )  => {
    const activeCamera = cameras[index];
    const activeProperties = new Map(activeCamera.properties);
    activeProperties.set(property, value);
    const newProperties = new Map(cameraProperties);
    newProperties.set(activeCamera.uuid, activeProperties);
    activeCamera.properties = activeProperties;
    setCameraProperties(newProperties);
  }

  const handleKeyframeSlider = (
    event: Event,
    newValue: number | number[],
    activeThumb: number,
  ) => {
    setCameraProperty('TIME', newValue[activeThumb], activeThumb);
  };

  // when the slider changes, update the main camera position
  useEffect(() => {
    if (cameras.length > 1) {
      const point = Math.min(slider_value / (cameras.length - 1.0), 1);
      let position = null;
      let lookat = null;
      let up = null;
      let fov = null;
      if (!is_linear) {
        // interpolate to get the points
        position = curve_object.curve_positions.getPoint(point);
        lookat = curve_object.curve_lookats.getPoint(point);
        up = curve_object.curve_ups.getPoint(point);
        fov = curve_object.curve_fovs.getPoint(point).z;
      } else {
        position = curve_object.curve_positions.getPointAt(point);
        lookat = curve_object.curve_lookats.getPointAt(point);
        up = curve_object.curve_ups.getPointAt(point);
        fov = curve_object.curve_fovs.getPointAt(point).z;
      }
      const mat = get_transform_matrix(position, lookat, up);
      set_camera_position(camera_render, mat);
      camera_render.fov = fov;
    }
  }, [slider_value, render_height, render_width]);

  // call this function whenever slider state changes
  useEffect(() => {
    if (is_playing && cameras.length > 1) {
      const interval = setInterval(() => {
        set_slider_value((prev) => prev + step_size);
      }, 1000 / fps);
      return () => clearInterval(interval);
    }
    return () => {};
  }, [is_playing]);

  // make sure to pause if the slider reaches the end
  useEffect(() => {
    if (slider_value >= slider_max) {
      set_slider_value(slider_max);
      setIsPlaying(false);
    }
  }, [slider_value]);

  const get_camera_path = () => {
    // NOTE: currently assuming these are ints
    const num_points = fps * seconds;

    const positions = curve_object.curve_positions.getPoints(num_points);
    const lookats = curve_object.curve_lookats.getPoints(num_points);
    const ups = curve_object.curve_ups.getPoints(num_points);
    const fovs = curve_object.curve_fovs.getPoints(num_points);

    const camera_path = [];

    for (let i = 0; i < num_points; i += 1) {
      const position = positions[i];
      const lookat = lookats[i];
      const up = ups[i];
      const fov = fovs[i].z;

      const mat = get_transform_matrix(position, lookat, up);

      camera_path.push({
        camera_to_world: mat.transpose().elements, // convert from col-major to row-major matrix
        fov,
        aspect: camera_render.aspect,
      });
    }

    const keyframes = [];
    for (let i = 0; i < cameras.length; i += 1) {
      const camera = cameras[i];
      keyframes.push({
        matrix: JSON.stringify(camera.matrix.toArray()),
        fov: camera.fov,
        aspect: camera_render.aspect,
      });
    }

    // const myData
    const camera_path_object = {
      keyframes,
      render_height,
      render_width,
      camera_path,
      fps,
      seconds,
      smoothness_value,
      is_cycle,
      is_linear,
    };
    return camera_path_object;
  };

  const export_camera_path = () => {
    // export the camera path
    // inspired by:
    // https://stackoverflow.com/questions/55613438/reactwrite-to-json-file-or-export-download-no-server

    const camera_path_object = get_camera_path();
    console.log(camera_render.toJSON());

    // create file in browser
    const json = JSON.stringify(camera_path_object, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const href = URL.createObjectURL(blob);

    // create "a" HTLM element with href to file
    const link = document.createElement('a');
    link.href = href;

    const filename = 'camera_path.json';
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    // clean up "a" element & remove ObjectURL
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  };

  const load_camera_path = (camera_path_object) => {
    // TODO UI for getting json

    const new_camera_list = [];

    setRenderHeight(camera_path_object.render_height);
    setUIRenderHeight(camera_path_object.render_height);
    setRenderWidth(camera_path_object.render_width);
    setUIRenderWidth(camera_path_object.render_width);

    setFps(camera_path_object.fps);
    setUIfps(camera_path_object.fps);

    setSeconds(camera_path_object.seconds);
    setUISeconds(camera_path_object.seconds);

    set_smoothness_value(camera_path_object.smoothness_value);
    setIsCycle(camera_path_object.is_cycle);
    setIsLinear(camera_path_object.is_linear);

    for (let i = 0; i < camera_path_object.keyframes.length; i += 1) {
      const keyframe = camera_path_object.keyframes[i];
      const camera = new THREE.PerspectiveCamera(
        keyframe.fov,
        keyframe.aspect,
        0.1,
        1000,
      );

      const mat = new THREE.Matrix4();
      mat.fromArray(JSON.parse(keyframe.matrix));
      // camera.matrix = mat;
      set_camera_position(camera, mat);
      new_camera_list.push(camera);
    }

    setCameras(new_camera_list);
    reset_slider_render_on_add(new_camera_list);
  };

  const uploadCameraPath = (e) => {
    const fileUpload = e.target.files[0];

    const fr = new FileReader();
    fr.onload = (res) => {
      const camera_path_object = JSON.parse(res.target.result);
      load_camera_path(camera_path_object);
    };

    fr.readAsText(fileUpload);
  };

  const copy_cmd_to_clipboard = () => {
    console.log('copy_cmd_to_clipboard');

    const camera_path_object = get_camera_path();

    // Copy the text inside the text field
    const config_filename = `${config_base_dir}/config.yml`;
    const camera_path_filename = `${config_base_dir}/camera_path.json`;
    const cmd = `ns-render --load-config ${config_filename} --traj filename --camera-path-filename ${camera_path_filename} --output-path renders/output.mp4`;
    navigator.clipboard.writeText(cmd);

    const camera_path_payload = {
      camera_path_filename,
      camera_path: camera_path_object,
    };

    // send a command of the websocket to save the trajectory somewhere!
    if (websocket.readyState === WebSocket.OPEN) {
      const data = {
        type: 'write',
        path: 'camera_path_payload',
        data: camera_path_payload,
      };
      const message = msgpack.encode(data);
      websocket.send(message);
    }
  };

  return (
    <div className="CameraPanel">
      <div>
        <div className="CameraPanel-top-button">
          <Button
            size="small"
            className="CameraPanel-top-button"
            component="label"
            variant="outlined"
            startIcon={<FileUploadOutlinedIcon />}
          >
            Load Path
            <input
              type="file"
              accept=".json"
              name="Camera Path"
              onChange={uploadCameraPath}
              hidden
            />
          </Button>
        </div>
        <div className="CameraPanel-top-button">
          <Button
            size="small"
            className="CameraPanel-top-button"
            variant="outlined"
            startIcon={<FileDownloadOutlinedIcon />}
            onClick={export_camera_path}
          >
            Export Path
          </Button>
        </div>
        <div className="CameraPanel-top-button">
          <Tooltip title="Copy Cmd to Clipboard">
            <IconButton onClick={copy_cmd_to_clipboard}>
              <ContentPasteGo />
            </IconButton>
          </Tooltip>
        </div>
      </div>
      <div className="CameraList-row-time-interval">
        <TextField
          label="Height"
          inputProps={{
            inputMode: 'numeric',
            pattern: '[+-]?([0-9]*[.])?[0-9]+',
          }}
          size="small"
          onChange={(e) => {
            if (e.target.validity.valid) {
              setUIRenderHeight(e.target.value);
            }
          }}
          onBlur={(e) => {
            if (e.target.validity.valid) {
              if (e.target.value !== '') {
                setRenderHeight(parseInt(e.target.value, 10));
              } else {
                setUIRenderHeight(render_height);
              }
            }
          }}
          value={ui_render_height}
          error={ui_render_height <= 0}
          helperText={ui_render_height <= 0 ? 'Required' : ''}
          variant="standard"
        />
        <TextField
          label="Width"
          inputProps={{
            inputMode: 'numeric',
            pattern: '[+-]?([0-9]*[.])?[0-9]+',
          }}
          size="small"
          onChange={(e) => {
            if (e.target.validity.valid) {
              setUIRenderWidth(e.target.value);
            }
          }}
          onBlur={(e) => {
            if (e.target.validity.valid) {
              if (e.target.value !== '') {
                setRenderWidth(parseInt(e.target.value, 10));
              } else {
                setUIRenderWidth(render_width);
              }
            }
          }}
          value={ui_render_width}
          error={ui_render_width <= 0}
          helperText={ui_render_width <= 0 ? 'Required' : ''}
          variant="standard"
        />
        <FovSelector
          fovLabel={fovLabel}
          setFovLabel={setFovLabel}
          camera={camera_main}
          dispatch={dispatch}
          changeMain
        />
      </div>
      <div className="CameraList-row-time-interval">
        <TextField
          label="Seconds"
          inputProps={{
            inputMode: 'numeric',
            pattern: '[+-]?([0-9]*[.])?[0-9]+',
          }}
          size="small"
          onChange={(e) => {
            if (e.target.validity.valid) {
              setUISeconds(e.target.value);
            }
          }}
          onBlur={(e) => {
            if (e.target.validity.valid) {
              if (e.target.value !== '') {
                setSeconds(parseInt(e.target.value, 10));
              } else {
                setUISeconds(seconds);
              }
            }
          }}
          value={ui_seconds}
          error={ui_seconds <= 0}
          helperText={ui_seconds <= 0 ? 'Required' : ''}
          variant="standard"
        />
        <TextField
          label="FPS"
          inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
          size="small"
          onChange={(e) => {
            if (e.target.validity.valid) {
              setUIfps(e.target.value);
            }
          }}
          onBlur={(e) => {
            if (e.target.validity.valid) {
              if (e.target.value !== '') {
                setFps(parseInt(e.target.value, 10));
              } else {
                setUIfps(fps);
              }
            }
          }}
          value={ui_fps}
          error={ui_fps <= 0}
          helperText={ui_fps <= 0 ? 'Required' : ''}
          variant="standard"
        />
      </div>
      <div>
        <div className="CameraPanel-top-button">
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddAPhotoIcon />}
            onClick={add_camera}
          >
            Add Camera
          </Button>
        </div>
        <div className="CameraPanel-top-button">
          <Tooltip className="curve-button" title="Close/Open camera spline">
            {!is_cycle ? (
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setIsCycle(true);
                }}
              >
                <GestureOutlined />
              </Button>
            ) : (
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setIsCycle(false);
                }}
              >
                <AllInclusiveOutlined />
              </Button>
            )}
          </Tooltip>
        </div>
        <div className="CameraPanel-top-button">
          <Tooltip title="Non-linear/Linear camera speed">
            {!is_linear ? (
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setIsLinear(true);
                }}
              >
                <LinearScaleOutlined />
              </Button>
            ) : (
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setIsLinear(false);
                }}
              >
                <Timeline />
              </Button>
            )}
          </Tooltip>
        </div>
      </div>
      <div
        className="CameraPanel-slider-container"
        style={{ marginTop: '5px' }}
      >
        <Stack spacing={2} direction="row" sx={{ mb: 1 }} alignItems="center">
          <p style={{ fontSize: 'smaller', color: '#999999' }}>Smoothness</p>
          <ChangeHistory />
          <Slider
            value={smoothness_value}
            step={step_size}
            valueLabelFormat={smoothness_value.toFixed(2)}
            min={0}
            max={1}
            onChange={(event, value) => {
              set_smoothness_value(value);
            }}
          />
          <RadioButtonUnchecked />
        </Stack>
      </div>
      <div className="CameraPanel-slider-container">
        <b style={{ fontSize: 'smaller', color: '#999999', textAlign: 'left', }}>Camera Keyframes</b>
        <Slider
          value={values}
          step={step_size}
          valueLabelDisplay="auto"
          valueLabelFormat={(value, i) => {return `${cameras[i].properties.get('NAME')} @ ${value.toFixed(2) * seconds}s`}}
          marks={marks}
          min={slider_min}
          max={slider_max}
          disabled={cameras.length < 2}
          track={false}
          onChange={handleKeyframeSlider}
          disableSwap
        />
        <b style={{ fontSize: 'smaller', color: '#999999', textAlign: 'left', }}>Playback</b>
        <Slider
          value={slider_value}
          step={step_size}
          valueLabelDisplay="on"
          valueLabelFormat={slider_value.toFixed(2)}
          marks={marks}
          min={slider_min}
          max={slider_max}
          disabled={cameras.length < 2}
          onChange={(event, value) => {
            set_slider_value(value);
          }}
        />
      </div>
      <div className="CameraPanel-slider-button-container">
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            setIsPlaying(false);
            set_slider_value(slider_min);
          }}
        >
          <FirstPage />
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={() =>
            set_slider_value(Math.max(0.0, slider_value - step_size))
          }
        >
          <ArrowBackIosNew />
        </Button>
        {/* eslint-disable-next-line no-nested-ternary */}
        {!is_playing && slider_max === slider_value ? (
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              set_slider_value(slider_min);
            }}
          >
            <Replay />
          </Button>
        ) : !is_playing ? (
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              if (cameras.length > 1) {
                setIsPlaying(true);
              }
            }}
          >
            <PlayArrow />
          </Button>
        ) : (
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setIsPlaying(false);
            }}
          >
            <Pause />
          </Button>
        )}
        <Button
          size="small"
          variant="outlined"
          onClick={() =>
            set_slider_value(Math.min(slider_max, slider_value + step_size))
          }
        >
          <ArrowForwardIos />
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={() => set_slider_value(slider_max)}
        >
          <LastPage />
        </Button>
      </div>
      <div className="CameraList-container">
        <CameraList
          sceneTree={sceneTree}
          transform_controls={transform_controls}
          camera_main={camera_render}
          cameras={cameras}
          setCameras={setCameras}
          swapCameras={swapCameras}
          cameraProperties={cameraProperties}
          setCameraProperties={setCameraProperties}
          fovLabel={fovLabel}
          setFovLabel={setFovLabel}
          dispatch={dispatch}
        />
      </div>
    </div>
  );
}
